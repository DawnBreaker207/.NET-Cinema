using System.Text.Json;
using Cinema.Api.Common;
using Cinema.Api.Data;
using Cinema.Api.Dtos;
using Cinema.Api.Models;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Cinema.Api.Services;

// Mirrors Go hall management (F4): templates, grid generation, clone,
// bulk edit (one tx), merge/split, layout guards vs bookings.
public sealed class HallService
{
    private static readonly HashSet<string> SeatTypes = new() { "standard", "vip", "couple", "recliner" };

    private readonly CinemaDbContext _db;
    public HallService(CinemaDbContext db) => _db = db;

    public static HallResponse ToDto(Hall h) => new(h.Id, h.Name, h.Rows, h.SeatsPerRow,
        h.ScreenPosition, ParseAisles(h.AisleAfterCols), h.Active);

    public static List<int> ParseAisles(string json)
    {
        try { return JsonSerializer.Deserialize<List<int>>(json) ?? new(); }
        catch { return new(); }
    }

    public List<HallTemplateResponse> Templates()
    {
        return new[]
        {
            ("small", 6, 10, new[] { "5" }, new[] { "6" }),
            ("medium", 10, 12, new[] { "8", "9" }, new[] { "10" }),
            ("large", 10, 20, new[] { "8", "9" }, new[] { "10" }),
        }.Select(t =>
        {
            var seats = Preview(t.Item2, t.Item3, t.Item4, t.Item5);
            return new HallTemplateResponse(t.Item1, t.Item2, t.Item3, seats.Count,
                seats.GroupBy(s => s).ToDictionary(g => g.Key, g => g.Count()));
        }).ToList();
    }

    public async Task<List<HallResponse>> ListAsync()
    {
        var rows = await _db.Halls.AsNoTracking().Where(x => x.DeletedAt == null)
            .OrderBy(x => x.Name).ToListAsync();
        return rows.Select(ToDto).ToList();
    }

    // Go: GET /admin/halls is paged (response.List) with ?search= on the name.
    public async Task<(List<HallResponse> Items, long Total)> ListPagedAsync(
        string? search, int page, int pageSize)
    {
        var q = _db.Halls.AsNoTracking().Where(x => x.DeletedAt == null);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLower();
            q = q.Where(x => x.Name.ToLower().Contains(s));
        }
        var total = await q.LongCountAsync();
        var rows = await q.OrderBy(x => x.Name).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
        return (rows.Select(ToDto).ToList(), total);
    }

    public async Task<HallResponse> GetAsync(Guid id)
    {
        var h = await _db.Halls.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.DeletedAt == null)
            ?? throw ApiException.NotFound("hall not found", "not_found");
        return ToDto(h);
    }

    public async Task<HallResponse> CreateAsync(HallRequest r)
    {
        if (string.IsNullOrWhiteSpace(r.Name) || r.Name.Length > 255)
            throw ApiException.Validation(new() { ["name"] = "must be 1..255 chars" });
        if (await _db.Halls.AnyAsync(x => x.Name == r.Name && x.DeletedAt == null))
            throw ApiException.Conflict("hall name already exists", "hall_name_taken");

        var (rows, spr, types, gaps, spans, screen, aisles) = ResolveParams(r);
        var now = DateTime.UtcNow;
        var h = new Hall
        {
            Id = Guid.NewGuid(),
            Name = r.Name.Trim(),
            Rows = rows,
            SeatsPerRow = spr,
            ScreenPosition = screen,
            AisleAfterCols = JsonSerializer.Serialize(aisles),
            Active = r.Active ?? true,
            CreatedAt = now,
            UpdatedAt = now,
        };
        await using var tx = await _db.Database.BeginTransactionAsync();
        _db.Halls.Add(h);
        await _db.SaveChangesAsync();
        try
        {
            await InsertSeatsAsync(h, types, gaps, spans, now);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pg && pg.SqlState == "23505")
        {
            throw ApiException.Conflict("hall name already exists", "hall_name_taken");
        }
        await _db.SaveChangesAsync();
        await tx.CommitAsync();
        return ToDto(h);
    }

    public async Task<HallResponse> CloneAsync(Guid id, CloneHallRequest r)
    {
        if (string.IsNullOrWhiteSpace(r.Name) || r.Name.Length > 255)
            throw ApiException.Validation(new() { ["name"] = "must be 1..255 chars" });
        var src = await _db.Halls.SingleOrDefaultAsync(x => x.Id == id && x.DeletedAt == null)
            ?? throw ApiException.NotFound("hall not found", "not_found");
        if (await _db.Halls.AnyAsync(x => x.Name == r.Name && x.DeletedAt == null))
            throw ApiException.Conflict("hall name already exists", "hall_name_taken");
        var seats = await _db.Seats.AsNoTracking().Where(x => x.HallId == id)
            .OrderBy(x => x.RowIndex).ThenBy(x => x.ColNumber).ToListAsync();
        var now = DateTime.UtcNow;
        var h = new Hall
        {
            Id = Guid.NewGuid(),
            Name = r.Name.Trim(),
            Rows = src.Rows,
            SeatsPerRow = src.SeatsPerRow,
            ScreenPosition = src.ScreenPosition,
            AisleAfterCols = src.AisleAfterCols,
            Active = true,
            CreatedAt = now,
            UpdatedAt = now,
        };
        await using var tx = await _db.Database.BeginTransactionAsync();
        _db.Halls.Add(h);
        await _db.SaveChangesAsync();
        foreach (var s in seats)
            _db.Seats.Add(new Seat
            {
                Id = Guid.NewGuid(),
                HallId = h.Id,
                RowIndex = s.RowIndex,
                RowLabel = s.RowLabel,
                ColNumber = s.ColNumber,
                SeatType = s.SeatType,
                IsGap = s.IsGap,
                ColSpan = s.ColSpan,
                CreatedAt = now,
                UpdatedAt = now,
            });
        try { await _db.SaveChangesAsync(); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pg && pg.SqlState == "23505")
        {
            throw ApiException.Conflict("hall name already exists", "hall_name_taken");
        }
        await tx.CommitAsync();
        return ToDto(h);
    }

    public async Task<HallResponse> UpdateAsync(Guid id, UpdateHallRequest r)
    {
        var h = await _db.Halls.SingleOrDefaultAsync(x => x.Id == id && x.DeletedAt == null)
            ?? throw ApiException.NotFound("hall not found", "not_found");
        if (r.Name != null)
        {
            if (r.Name.Length is < 1 or > 255)
                throw ApiException.Validation(new() { ["name"] = "must be 1..255 chars" });
            if (await _db.Halls.AnyAsync(x => x.Id != id && x.Name == r.Name && x.DeletedAt == null))
                throw ApiException.Conflict("hall name already exists", "hall_name_taken");
            h.Name = r.Name.Trim();
        }
        if (r.ScreenPosition != null)
        {
            if (r.ScreenPosition is not ("front" or "back"))
                throw ApiException.Validation(new() { ["screen_position"] = "must be front or back" });
            h.ScreenPosition = r.ScreenPosition;
        }
        if (r.AisleAfterCols != null) h.AisleAfterCols = JsonSerializer.Serialize(r.AisleAfterCols);
        if (r.Active.HasValue)
        {
            if (!r.Active.Value && await HasOpenUpcomingAsync(id))
                throw ApiException.Conflict("hall has open upcoming showtimes", "hall_has_showtimes");
            h.Active = r.Active.Value;
        }
        h.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return ToDto(h);
    }

    public async Task<HallResponse> RegenerateAsync(Guid id, HallRequest r)
    {
        var h = await _db.Halls.SingleOrDefaultAsync(x => x.Id == id && x.DeletedAt == null)
            ?? throw ApiException.NotFound("hall not found", "not_found");
        await using var tx = await _db.Database.BeginTransactionAsync();
        await _db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(hashtext({0}))", id.ToString());
        if (await _db.Bookings.AnyAsync(x => _db.Showtimes
            .Where(s => s.HallId == id).Select(s => s.Id).Contains(x.ShowtimeId)))
            throw ApiException.Conflict("hall already has orders; cannot regenerate", "hall_has_orders");
        var (rows, spr, types, gaps, spans, screen, aisles) = ResolveParams(r);
        h.Rows = rows; h.SeatsPerRow = spr; h.ScreenPosition = screen;
        h.AisleAfterCols = JsonSerializer.Serialize(aisles);
        h.UpdatedAt = DateTime.UtcNow;
        var stIds = await _db.Showtimes.Where(s => s.HallId == id).Select(s => s.Id).ToListAsync();
        await _db.ShowtimeSeats.Where(x => stIds.Contains(x.ShowtimeId)).ExecuteDeleteAsync();
        await _db.Seats.Where(x => x.HallId == id).ExecuteDeleteAsync();
        var now = DateTime.UtcNow;
        await InsertSeatsAsync(h, types, gaps, spans, now);
        await _db.SaveChangesAsync();
        // Rebuild showtime_seats for existing showtimes of this hall.
        foreach (var st in stIds)
        {
            var seats = await _db.Seats.Where(x => x.HallId == id && !x.IsGap).ToListAsync();
            foreach (var s in seats)
                _db.ShowtimeSeats.Add(new ShowtimeSeat
                {
                    Id = Guid.NewGuid(),
                    ShowtimeId = st,
                    SeatId = s.Id,
                    CreatedAt = now,
                    UpdatedAt = now,
                });
        }
        await _db.SaveChangesAsync();
        await tx.CommitAsync();
        return ToDto(h);
    }

    public async Task DeleteAsync(Guid id)
    {
        var h = await _db.Halls.SingleOrDefaultAsync(x => x.Id == id && x.DeletedAt == null)
            ?? throw ApiException.NotFound("hall not found", "not_found");
        await using var tx = await _db.Database.BeginTransactionAsync();
        await _db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(hashtext({0}))", id.ToString());
        var now = DateTime.UtcNow;
        if (await _db.Showtimes.AnyAsync(s => s.HallId == id && s.DeletedAt == null && s.StartAt > now))
            throw ApiException.Conflict("hall has upcoming showtimes", "hall_has_showtimes");
        h.DeletedAt = now;
        await _db.SaveChangesAsync();
        await tx.CommitAsync();
    }

    public async Task<List<SeatResponse>> SeatsAsync(Guid id)
    {
        await RequireHallAsync(id);
        return await _db.Seats.AsNoTracking().Where(x => x.HallId == id)
            .OrderBy(x => x.RowIndex).ThenBy(x => x.ColNumber)
            .Select(s => new SeatResponse(s.Id, s.HallId, s.RowLabel + s.ColNumber,
                s.RowLabel, s.ColNumber, s.SeatType, s.IsGap, s.ColSpan))
            .ToListAsync();
    }

    public async Task<SeatResponse> UpdateSeatAsync(Guid hallId, Guid seatId, SeatUpdateRequest r)
    {
        var s = await _db.Seats.SingleOrDefaultAsync(x => x.Id == seatId && x.HallId == hallId)
            ?? throw ApiException.NotFound("seat not found", "not_found");
        await using var tx = await _db.Database.BeginTransactionAsync();
        await _db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(hashtext({0}))", hallId.ToString());
        await GuardNoLiveBookingsAsync(hallId);
        ApplySeatChange(s, r.SeatType, r.IsGap);
        s.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        await tx.CommitAsync();
        return new SeatResponse(s.Id, s.HallId, s.RowLabel + s.ColNumber,
            s.RowLabel, s.ColNumber, s.SeatType, s.IsGap, s.ColSpan);
    }

    public async Task BulkUpdateAsync(Guid hallId, BulkSeatUpdateRequest req)
    {
        if (req.Changes is not { Count: >= 1 and <= 50 })
            throw ApiException.Validation(new() { ["changes"] = "must have 1..50 changes" });
        await RequireHallAsync(hallId);
        await using var tx = await _db.Database.BeginTransactionAsync();
        await _db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(hashtext({0}))", hallId.ToString());
        await GuardNoLiveBookingsAsync(hallId);
        var seats = await _db.Seats.Where(x => x.HallId == hallId).ToListAsync();
        foreach (var ch in req.Changes)
        {
            var targets = SelectSeats(seats, ch.Selector);
            if (targets.Count == 0)
                throw ApiException.BadRequest("selector matched no seats", "selector_empty");
            foreach (var s in targets) ApplySeatChange(s, ch.SeatType, ch.IsGap);
        }
        var now = DateTime.UtcNow;
        foreach (var s in seats) s.UpdatedAt = now;
        await _db.SaveChangesAsync();
        await tx.CommitAsync();
    }

    public async Task<SeatResponse> AddSeatAsync(Guid hallId, AddSeatRequest r)
    {
        if (r.SeatType != null && r.SeatType is not ("standard" or "vip" or "recliner"))
            throw ApiException.Validation(new() { ["seat_type"] = "cannot create couple directly; merge instead" });
        var h = await RequireHallAsync(hallId);
        await using var tx = await _db.Database.BeginTransactionAsync();
        await _db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(hashtext({0}))", hallId.ToString());
        await GuardNoLiveBookingsAsync(hallId);
        var rowSeats = await _db.Seats.Where(x => x.HallId == hallId && x.RowLabel == r.RowLabel).ToListAsync();
        if (rowSeats.Count == 0) throw ApiException.BadRequest("row does not exist", "row_not_found");
        var maxEnd = rowSeats.Max(s => s.ColNumber + s.ColSpan - 1);
        var now = DateTime.UtcNow;
        var s = new Seat
        {
            Id = Guid.NewGuid(),
            HallId = hallId,
            RowIndex = rowSeats[0].RowIndex,
            RowLabel = r.RowLabel,
            ColNumber = maxEnd + 1,
            SeatType = r.SeatType ?? "standard",
            CreatedAt = now,
            UpdatedAt = now,
        };
        _db.Seats.Add(s);
        await _db.SaveChangesAsync();
        await tx.CommitAsync();
        return new SeatResponse(s.Id, s.HallId, s.RowLabel + s.ColNumber,
            s.RowLabel, s.ColNumber, s.SeatType, s.IsGap, s.ColSpan);
    }

    public async Task AddRowAsync(Guid hallId)
    {
        var h = await RequireHallAsync(hallId);
        await using var tx = await _db.Database.BeginTransactionAsync();
        await _db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(hashtext({0}))", hallId.ToString());
        await GuardNoLiveBookingsAsync(hallId);
        var maxRow = await _db.Seats.Where(x => x.HallId == hallId).MaxAsync(x => (int?)x.RowIndex) ?? 0;
        var label = SeatLabels.RowLabel(maxRow + 1);
        var now = DateTime.UtcNow;
        for (var c = 1; c <= h.SeatsPerRow; c++)
            _db.Seats.Add(new Seat
            {
                Id = Guid.NewGuid(),
                HallId = hallId,
                RowIndex = maxRow + 1,
                RowLabel = label,
                ColNumber = c,
                CreatedAt = now,
                UpdatedAt = now,
            });
        h.Rows = maxRow + 1; h.UpdatedAt = now;
        await _db.SaveChangesAsync();
        await tx.CommitAsync();
    }

    public async Task DeleteRowAsync(Guid hallId, string rowLabel)
    {
        await RequireHallAsync(hallId);
        await using var tx = await _db.Database.BeginTransactionAsync();
        await _db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(hashtext({0}))", hallId.ToString());
        await GuardNoLiveBookingsAsync(hallId);
        var ids = await _db.Seats.Where(x => x.HallId == hallId && x.RowLabel == rowLabel)
            .Select(x => x.Id).ToListAsync();
        if (ids.Count == 0) throw ApiException.BadRequest("row does not exist", "row_not_found");
        await RemoveSeatsSafeAsync(ids);
        await tx.CommitAsync();
    }

    public async Task AddColumnAsync(Guid hallId)
    {
        var h = await RequireHallAsync(hallId);
        await using var tx = await _db.Database.BeginTransactionAsync();
        await _db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(hashtext({0}))", hallId.ToString());
        await GuardNoLiveBookingsAsync(hallId);
        var rows = await _db.Seats.Where(x => x.HallId == hallId)
            .GroupBy(x => new { x.RowIndex, x.RowLabel })
            .Select(g => new { g.Key.RowIndex, g.Key.RowLabel, MaxEnd = g.Max(s => s.ColNumber + s.ColSpan - 1) })
            .ToListAsync();
        var now = DateTime.UtcNow;
        foreach (var r in rows)
            _db.Seats.Add(new Seat
            {
                Id = Guid.NewGuid(),
                HallId = hallId,
                RowIndex = r.RowIndex,
                RowLabel = r.RowLabel,
                ColNumber = r.MaxEnd + 1,
                CreatedAt = now,
                UpdatedAt = now,
            });
        h.SeatsPerRow += 1; h.UpdatedAt = now;
        await _db.SaveChangesAsync();
        await tx.CommitAsync();
    }

    public async Task<SeatResponse> MergeAsync(Guid hallId, MergeSeatsRequest r)
    {
        var (rl, cl) = ParseLabel(r.LeftLabel);
        var (rr, cr) = ParseLabel(r.RightLabel);
        if (rl != rr || cr != cl + 1)
            throw ApiException.BadRequest("seats must be adjacent in the same row", "not_adjacent");
        await RequireHallAsync(hallId);
        await using var tx = await _db.Database.BeginTransactionAsync();
        await _db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(hashtext({0}))", hallId.ToString());
        var seats = await _db.Seats.Where(x => x.HallId == hallId && x.RowLabel == rl
                && (x.ColNumber == cl || x.ColNumber == cr)).ToListAsync();
        if (seats.Count != 2) throw ApiException.BadRequest("seats not found", "not_found");
        var left = seats.Single(x => x.ColNumber == cl);
        var right = seats.Single(x => x.ColNumber == cr);
        if (left.SeatType != "standard" || right.SeatType != "standard" || left.IsGap || right.IsGap)
            throw ApiException.BadRequest("only two adjacent standard seats can merge", "merge_invalid");
        await GuardNoHistoryAsync(hallId, new[] { left.Id, right.Id });
        left.SeatType = "couple"; left.ColSpan = 2; left.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        _db.Entry(right).State = EntityState.Detached;
        await RemoveSeatsSafeAsync(new List<Guid> { right.Id });
        await _db.SaveChangesAsync();
        await tx.CommitAsync();
        return new SeatResponse(left.Id, left.HallId, left.RowLabel + left.ColNumber,
            left.RowLabel, left.ColNumber, left.SeatType, left.IsGap, left.ColSpan);
    }

    public async Task<List<SeatResponse>> SplitAsync(Guid hallId, SplitSeatRequest r)
    {
        var (rl, cl) = ParseLabel(r.Label);
        await RequireHallAsync(hallId);
        await using var tx = await _db.Database.BeginTransactionAsync();
        await _db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(hashtext({0}))", hallId.ToString());
        var s = await _db.Seats.SingleOrDefaultAsync(x => x.HallId == hallId && x.RowLabel == rl && x.ColNumber == cl)
            ?? throw ApiException.NotFound("seat not found", "not_found");
        if (s.SeatType != "couple" || s.ColSpan != 2)
            throw ApiException.BadRequest("only a couple seat can split", "split_invalid");
        await GuardNoHistoryAsync(hallId, new[] { s.Id });
        var now = DateTime.UtcNow;
        s.SeatType = "standard"; s.ColSpan = 1; s.UpdatedAt = now;
        var right = new Seat
        {
            Id = Guid.NewGuid(),
            HallId = hallId,
            RowIndex = s.RowIndex,
            RowLabel = rl,
            ColNumber = cl + 1,
            SeatType = "standard",
            CreatedAt = now,
            UpdatedAt = now,
        };
        _db.Seats.Add(right);
        await _db.SaveChangesAsync();
        await tx.CommitAsync();
        return new[]
        {
            new SeatResponse(s.Id, s.HallId, s.RowLabel + s.ColNumber, s.RowLabel, s.ColNumber, s.SeatType, s.IsGap, s.ColSpan),
            new SeatResponse(right.Id, right.HallId, right.RowLabel + right.ColNumber, right.RowLabel, right.ColNumber, right.SeatType, right.IsGap, right.ColSpan),
        }.ToList();
    }

    // ---- helpers ----
    private async Task<Hall> RequireHallAsync(Guid id)
        => await _db.Halls.SingleOrDefaultAsync(x => x.Id == id && x.DeletedAt == null)
            ?? throw ApiException.NotFound("hall not found", "not_found");

    private Task<bool> HasOpenUpcomingAsync(Guid hallId)
    {
        var now = DateTime.UtcNow;
        return _db.Showtimes.AnyAsync(s => s.HallId == hallId && s.DeletedAt == null
            && s.StartAt > now && s.Status == "open");
    }

    private async Task GuardNoLiveBookingsAsync(Guid hallId)
    {
        var stIds = _db.Showtimes.Where(s => s.HallId == hallId).Select(s => s.Id);
        if (await _db.Bookings.AnyAsync(x => stIds.Contains(x.ShowtimeId)
            && (x.Status == "pending" || x.Status == "confirmed")))
            throw ApiException.Conflict("hall has live orders; layout is locked", "hall_has_orders");
    }

    private async Task GuardNoHistoryAsync(Guid hallId, Guid[] seatIds)
    {
        var sts = await _db.ShowtimeSeats.Where(x => seatIds.Contains(x.SeatId))
            .Select(x => x.Id).ToListAsync();
        if (sts.Count > 0 && await _db.BookingSeats.AnyAsync(x => sts.Contains(x.ShowtimeSeatId)))
            throw ApiException.Conflict("seat already appeared in an order", "seat_has_history");
    }

    // Deleting physical seats is only safe when their showtime copies are all
    // untouched (no tickets, nothing held/sold); otherwise refuse like Go.
    private async Task RemoveSeatsSafeAsync(List<Guid> seatIds)
    {
        var stIds = await _db.ShowtimeSeats.Where(x => seatIds.Contains(x.SeatId))
            .Select(x => x.Id).ToListAsync();
        if (stIds.Count > 0)
        {
            if (await _db.Tickets.AnyAsync(x => stIds.Contains(x.ShowtimeSeatId))
                || await _db.ShowtimeSeats.AnyAsync(x => stIds.Contains(x.Id) && x.Status != "available"))
                throw ApiException.Conflict("seat already appeared in an order", "seat_has_history");
            await _db.ShowtimeSeats.Where(x => stIds.Contains(x.Id)).ExecuteDeleteAsync();
        }
        await _db.Seats.Where(x => seatIds.Contains(x.Id)).ExecuteDeleteAsync();
    }

    private static void ApplySeatChange(Seat s, string? type, bool? isGap)
    {
        if (type != null)
        {
            if (!SeatTypes.Contains(type))
                throw ApiException.Validation(new() { ["seat_type"] = "unknown seat type" });
            if ((s.SeatType == "couple") != (type == "couple"))
                throw ApiException.BadRequest(
                    "cannot convert to/from couple here; use merge/split or regenerate", "couple_locked");
            s.SeatType = type;
        }
        if (isGap.HasValue) s.IsGap = isGap.Value;
    }

    private static List<Seat> SelectSeats(List<Seat> all, SeatSelector sel)
    {
        var byLabel = all.ToDictionary(s => s.RowLabel + s.ColNumber);
        var out_ = new List<Seat>();
        var count = (sel.Labels?.Count ?? 0) + (sel.Rows?.Count ?? 0) + (sel.Cols?.Count ?? 0)
            + (sel.Range != null ? 1 : 0);
        if (count != 1)
            throw ApiException.Validation(new() { ["selector"] = "exactly one of labels/rows/cols/range" });
        if (sel.Labels != null)
            foreach (var l in sel.Labels)
                if (byLabel.TryGetValue(l.ToUpperInvariant(), out var s)) out_.Add(s);
        if (sel.Rows != null)
            out_.AddRange(all.Where(s => sel.Rows.Contains(s.RowLabel)));
        if (sel.Cols != null)
            out_.AddRange(all.Where(s => sel.Cols.Contains(s.ColNumber)));
        if (sel.Range != null)
        {
            var parts = sel.Range.Split(':');
            if (parts.Length != 2) throw ApiException.Validation(new() { ["selector"] = "bad range" });
            var (r1, c1) = ParseLabel(parts[0]);
            var (r2, c2) = ParseLabel(parts[1]);
            out_.AddRange(all.Where(s =>
                string.Compare(s.RowLabel, r1, StringComparison.Ordinal) >= 0 &&
                string.Compare(s.RowLabel, r2, StringComparison.Ordinal) <= 0 &&
                s.ColNumber >= Math.Min(c1, c2) && s.ColNumber <= Math.Max(c1, c2)));
        }
        return out_;
    }

    private static (string Row, int Col) ParseLabel(string label)
    {
        var l = label.Trim().ToUpperInvariant();
        var i = 0;
        while (i < l.Length && char.IsLetter(l[i])) i++;
        if (i == 0 || i == l.Length || !int.TryParse(l[i..], out var col) || col < 1)
            throw ApiException.Validation(new() { ["label"] = $"bad seat label {label}" });
        return (l[..i], col);
    }

    private (int Rows, int Spr, Dictionary<string, string> Types, HashSet<(string, int)> Gaps,
        HashSet<(string, int)> Spans, string Screen, List<int> Aisles) ResolveParams(HallRequest r)
    {
        var rows = r.Rows; var spr = r.SeatsPerRow;
        Dictionary<string, List<string>>? st = r.SeatTypes;
        if (r.Template != null)
        {
            var t = Templates().SingleOrDefault(x => x.Name == r.Template)
                ?? throw ApiException.Validation(new() { ["template"] = "unknown template" });
            if (rows == 0) rows = t.Rows;
            if (spr == 0) spr = t.SeatsPerRow;
        }
        if (rows is < 1 or > 50) throw ApiException.Validation(new() { ["rows"] = "must be 1..50" });
        if (spr is < 1 or > 50) throw ApiException.Validation(new() { ["seats_per_row"] = "must be 1..50" });
        var screen = r.ScreenPosition ?? "front";
        if (screen is not ("front" or "back"))
            throw ApiException.Validation(new() { ["screen_position"] = "must be front or back" });

        var types = new Dictionary<string, string>();
        if (st != null)
            foreach (var (type, rk) in st)
            {
                if (!SeatTypes.Contains(type))
                    throw ApiException.Validation(new() { ["seat_types"] = $"unknown type {type}" });
                foreach (var k in rk) types[NormalizeRowKey(k, rows)] = type;
            }
        HashSet<(string, int)> gaps = new(), spans = new();
        if (r.Gaps != null)
            foreach (var g in r.Gaps)
            {
                var p = ParseLabel(g);
                if (!ValidCell(p, rows, spr))
                    throw ApiException.Validation(new() { ["gaps"] = $"gap {g} outside grid" });
                gaps.Add(p);
            }
        if (r.Spans != null)
            foreach (var s in r.Spans)
            {
                var p = ParseLabel(s);
                if (!ValidCell(p, rows, spr))
                    throw ApiException.Validation(new() { ["spans"] = $"span {s} outside grid" });
                spans.Add(p);
            }
        return (rows, spr, types, gaps, spans, screen, r.AisleAfterCols ?? new());
    }

    private static string NormalizeRowKey(string k, int rows)
    {
        k = k.Trim().ToUpperInvariant();
        if (int.TryParse(k, out var n))
        {
            if (n < 1 || n > rows) throw ApiException.Validation(new() { ["seat_types"] = $"row {k} outside grid" });
            return SeatLabels.RowLabel(n);
        }
        return k;
    }

    private static bool ValidCell((string Row, int Col) p, int rows, int spr)
    {
        var n = 0;
        foreach (var ch in p.Row) n = n * 26 + (ch - 'A' + 1);
        return n >= 1 && n <= rows && p.Col >= 1 && p.Col <= spr;
    }

    private static List<string> Preview(int rows, int spr, string[] vipRows, string[] coupleRows)
    {
        var vip = vipRows.Select(int.Parse).ToHashSet();
        var cpl = coupleRows.Select(int.Parse).ToHashSet();
        var out_ = new List<string>();
        for (var r = 1; r <= rows; r++)
            for (var c = 0; c < spr; c++)
                out_.Add(vip.Contains(r) ? "vip" : cpl.Contains(r) ? "couple" : "standard");
        return out_;
    }

    private async Task InsertSeatsAsync(Hall h, Dictionary<string, string> types,
        HashSet<(string, int)> gaps, HashSet<(string, int)> spans, DateTime now)
    {
        for (var r = 1; r <= h.Rows; r++)
        {
            var label = SeatLabels.RowLabel(r);
            var type = types.GetValueOrDefault(label, "standard");
            var c = 1;
            while (c <= h.SeatsPerRow)
            {
                if (gaps.Contains((label, c)))
                {
                    _db.Seats.Add(MkSeat(h, r, label, c, "standard", true, 1, now));
                    c++;
                    continue;
                }
                if (type == "couple")
                {
                    if (c < h.SeatsPerRow && !gaps.Contains((label, c + 1)))
                    {
                        _db.Seats.Add(MkSeat(h, r, label, c, "couple", false, 2, now));
                        c += 2;
                        continue;
                    }
                    _db.Seats.Add(MkSeat(h, r, label, c, "standard", true, 1, now));
                    c++;
                    continue;
                }
                if (spans.Contains((label, c)) && c < h.SeatsPerRow)
                {
                    _db.Seats.Add(MkSeat(h, r, label, c, type, false, 2, now));
                    c += 2;
                    continue;
                }
                _db.Seats.Add(MkSeat(h, r, label, c, type, false, 1, now));
                c++;
            }
        }
        await Task.CompletedTask;
    }

    private static Seat MkSeat(Hall h, int r, string label, int c, string type, bool gap, short span, DateTime now)
        => new()
        {
            Id = Guid.NewGuid(),
            HallId = h.Id,
            RowIndex = r,
            RowLabel = label,
            ColNumber = c,
            SeatType = type,
            IsGap = gap,
            ColSpan = span,
            CreatedAt = now,
            UpdatedAt = now,
        };
}
