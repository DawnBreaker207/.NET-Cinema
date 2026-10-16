using Cinema.Api.Common;
using Cinema.Api.Data;
using Cinema.Api.Dtos;
using Cinema.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Cinema.Api.Services;

// Mirrors Go showtime service (F5/F6/F3): public listings, seatmap,
// admin CRUD with overlap guard + advisory lock, cancel.
public sealed class ShowService
{
    private readonly CinemaDbContext _db;
    private readonly PricingService _pricing;
    private readonly IConfiguration _cfg;
    public ShowService(CinemaDbContext db, PricingService pricing, IConfiguration cfg)
    { _db = db; _pricing = pricing; _cfg = cfg; }

    public static ShowtimeResponse ToDto(Showtime s, string movieTitle, string age, string hallName)
        => new(s.Id, s.MovieId, movieTitle, age, s.HallId, hallName,
            s.StartAt, s.EndAt, s.Status, s.CreatedAt, s.UpdatedAt);

    // ---- public listings ----
    public async Task<List<ShowtimeListItem>> ForMovieAsync(Guid movieId, string? date)
    {
        var m = await _db.Movies.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == movieId && x.DeletedAt == null);
        if (m is null || m.Status != "showing") return new();
        var (from, to) = DayRange(date);
        var now = DateTime.UtcNow;
        var sts = await _db.Showtimes.AsNoTracking()
            .Where(x => x.MovieId == movieId && x.DeletedAt == null && x.Status == "open"
                && x.StartAt > now && (date == null || (x.StartAt >= from && x.StartAt < to)))
            .Join(_db.Halls.AsNoTracking(), s => s.HallId, h => h.Id, (s, h) => new { s, h })
            .Where(x => x.h.Active && x.h.DeletedAt == null)
            .OrderBy(x => x.s.StartAt).ToListAsync();
        return await ToListItemsAsync(sts.Select(x => (x.s, x.h.Name)).ToList(), m.Title, m.AgeRating);
    }

    public async Task<List<ShowtimeListItem>> ByDateAsync(string? date)
    {
        var (from, to) = DayRange(date);
        var now = DateTime.UtcNow;
        var sts = await _db.Showtimes.AsNoTracking()
            .Where(x => x.DeletedAt == null && x.Status == "open" && x.StartAt > now
                && (date == null || (x.StartAt >= from && x.StartAt < to)))
            .Join(_db.Halls.AsNoTracking(), s => s.HallId, h => h.Id, (s, h) => new { s, h })
            .Where(x => x.h.Active && x.h.DeletedAt == null)
            .Join(_db.Movies.AsNoTracking(), x => x.s.MovieId, mv => mv.Id, (x, mv) => new { x.s, x.h, mv })
            .Where(x => x.mv.Status == "showing" && x.mv.DeletedAt == null)
            .OrderBy(x => x.s.StartAt).ToListAsync();
        var out_ = new List<ShowtimeListItem>();
        foreach (var g in sts.GroupBy(x => x.s.MovieId))
        {
            var first = g.First();
            out_.AddRange(await ToListItemsAsync(
                g.Select(x => (x.s, x.h.Name)).ToList(), first.mv.Title, first.mv.AgeRating));
        }
        return out_.OrderBy(x => x.StartAt).ToList();
    }

    private async Task<List<ShowtimeListItem>> ToListItemsAsync(
        List<(Showtime s, string hallName)> sts, string title, string age)
    {
        var out_ = new List<ShowtimeListItem>();
        foreach (var (s, hallName) in sts)
        {
            var types = await _db.Seats.AsNoTracking()
                .Where(x => x.HallId == s.HallId && !x.IsGap)
                .Select(x => x.SeatType).Distinct().ToListAsync();
            var prices = await _pricing.QuoteForAsync(s.StartAt, types);
            if (types.Any(t => !prices.ContainsKey(t) || prices[t] <= 0)) continue; // E-CAT5: hide unpriced
            out_.Add(new ShowtimeListItem(s.Id, s.MovieId, title, age, s.HallId, hallName,
                s.StartAt, s.EndAt, s.Status, prices.Values.Min()));
        }
        return out_;
    }

    // ---- seatmap (auth required) ----
    public async Task<SeatMapResponse> SeatMapAsync(Guid showId)
    {
        var s = await _db.Showtimes.AsNoTracking().SingleOrDefaultAsync(x => x.Id == showId)
            ?? throw ApiException.NotFound("showtime not found", "not_found");
        var now = DateTime.UtcNow;
        if (s.DeletedAt != null || s.StartAt <= now)
            throw ApiException.NotFound("showtime not found", "not_found");
        var m = await _db.Movies.AsNoTracking().SingleAsync(x => x.Id == s.MovieId);
        if (m.Status != "showing" || m.DeletedAt != null)
            throw ApiException.NotFound("showtime not found", "not_found");
        if (s.Status != "open")
            throw ApiException.Forbidden("showtime is closed", "showtime_closed");
        var h = await _db.Halls.AsNoTracking().SingleAsync(x => x.Id == s.HallId);

        var seats = await _db.Seats.AsNoTracking().Where(x => x.HallId == s.HallId)
            .OrderBy(x => x.RowIndex).ThenBy(x => x.ColNumber).ToListAsync();
        var ids = seats.Select(x => x.Id).ToList();
        var states = await _db.ShowtimeSeats.AsNoTracking()
            .Where(x => x.ShowtimeId == showId && ids.Contains(x.SeatId))
            .ToDictionaryAsync(x => x.SeatId);
        var types = seats.Where(x => !x.IsGap).Select(x => x.SeatType).Distinct().ToList();
        var prices = await _pricing.QuoteForAsync(s.StartAt, types);

        return new SeatMapResponse(s.Id, s.MovieId, m.Title, m.AgeRating, s.HallId, h.Name,
            s.StartAt, s.EndAt, s.Status, h.ScreenPosition, HallService.ParseAisles(h.AisleAfterCols),
            prices, seats.Select(x =>
            {
                states.TryGetValue(x.Id, out var st);
                return new SeatMapSeat(x.Id, st?.Id, x.RowLabel + x.ColNumber, x.RowLabel,
                    x.ColNumber, x.SeatType, x.IsGap, x.ColSpan,
                    x.IsGap ? "available" : st?.Status ?? "available",
                    prices.GetValueOrDefault(x.SeatType));
            }).ToList());
    }

    // ---- admin ----
    public async Task<(IReadOnlyList<ShowtimeResponse> Items, long Total)> AdminListAsync(
        Guid? movieId, Guid? hallId, string? status, string? date, string? from, string? to,
        string? sort, string? order, string? search, int page, int pageSize)
    {
        var q = _db.Showtimes.AsNoTracking().Where(x => x.DeletedAt == null);
        if (movieId.HasValue) q = q.Where(x => x.MovieId == movieId);
        if (hallId.HasValue) q = q.Where(x => x.HallId == hallId);
        if (status != null) q = q.Where(x => x.Status == status);
        if (!string.IsNullOrWhiteSpace(search))
        {
            // Go: LOWER(movies.title) / LOWER(halls.name) LIKE %search%.
            var s = search.Trim().ToLower();
            q = q.Where(x =>
                _db.Movies.Any(m => m.Id == x.MovieId && m.Title.ToLower().Contains(s)) ||
                _db.Halls.Any(h => h.Id == x.HallId && h.Name.ToLower().Contains(s)));
        }
        if (date != null)
        {
            var (df, dt) = DayRange(date);
            q = q.Where(x => x.StartAt >= df && x.StartAt < dt);
        }
        else
        {
            // Go: from/to are calendar days in cinema time (UTC+7).
            if (from != null)
            {
                var (ff, _) = DayRange(from);
                q = q.Where(x => x.StartAt >= ff);
            }
            if (to != null)
            {
                var (_, tt) = DayRange(to);
                q = q.Where(x => x.StartAt < tt);
            }
        }
        var desc = order != "asc";
        q = sort == "created_at"
            ? (desc ? q.OrderByDescending(x => x.CreatedAt) : q.OrderBy(x => x.CreatedAt))
            : (desc ? q.OrderByDescending(x => x.StartAt) : q.OrderBy(x => x.StartAt));
        var total = await q.LongCountAsync();
        var items = await q.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
        var out_ = new List<ShowtimeResponse>();
        foreach (var s in items)
        {
            var m = await _db.Movies.AsNoTracking().SingleAsync(x => x.Id == s.MovieId);
            var h = await _db.Halls.AsNoTracking().SingleAsync(x => x.Id == s.HallId);
            out_.Add(ToDto(s, m.Title, m.AgeRating, h.Name));
        }
        return (out_, total);
    }

    public async Task<ShowtimeResponse> AdminGetAsync(Guid id)
    {
        var s = await _db.Showtimes.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id)
            ?? throw ApiException.NotFound("showtime not found", "not_found");
        var m = await _db.Movies.AsNoTracking().SingleAsync(x => x.Id == s.MovieId);
        var h = await _db.Halls.AsNoTracking().SingleAsync(x => x.Id == s.HallId);
        return ToDto(s, m.Title, m.AgeRating, h.Name);
    }

    public async Task<ShowtimeResponse> CreateAsync(ShowtimeRequest r)
    {
        if (r.MovieId == Guid.Empty || r.HallId == Guid.Empty)
            throw ApiException.Validation(new() { ["movie_id"] = "required", ["hall_id"] = "required" });
        if (r.Status != null && r.Status is not ("open" or "closed"))
            throw ApiException.Validation(new() { ["status"] = "must be open or closed" });
        await using var tx = await _db.Database.BeginTransactionAsync();
        await _db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(hashtext({0}))", r.HallId.ToString());
        var m = await _db.Movies.FromSqlRaw("SELECT * FROM movies WHERE id = {0} FOR SHARE", r.MovieId)
            .SingleOrDefaultAsync() ?? throw ApiException.BadRequest("movie not found", "movie_not_found");
        if (m.Status != "showing" || m.DeletedAt != null)
            throw ApiException.BadRequest("movie is not showing", "movie_not_showing");
        var h = await _db.Halls.SingleOrDefaultAsync(x => x.Id == r.HallId && x.DeletedAt == null)
            ?? throw ApiException.BadRequest("hall not found", "hall_not_found");
        if (!h.Active) throw ApiException.BadRequest("hall is inactive", "hall_inactive");
        var start = r.StartAt.Kind == DateTimeKind.Utc ? r.StartAt : r.StartAt.ToUniversalTime();
        if (start <= DateTime.UtcNow.AddMinutes(5))
            throw ApiException.BadRequest("showtime starts too soon", "showtime_too_soon");
        var end = start.AddMinutes(m.Duration);
        await GuardOverlapAsync(r.HallId, null, start, end);
        var now = DateTime.UtcNow;
        var s = new Showtime
        {
            Id = Guid.NewGuid(),
            MovieId = r.MovieId,
            HallId = r.HallId,
            StartAt = start,
            EndAt = end,
            Status = r.Status ?? "open",
            CreatedAt = now,
            UpdatedAt = now,
        };
        _db.Showtimes.Add(s);
        await _db.SaveChangesAsync();
        await BuildSeatsAsync(s.Id, r.HallId, now);
        await _db.SaveChangesAsync();
        await tx.CommitAsync();
        return ToDto(s, m.Title, m.AgeRating, h.Name);
    }

    public async Task<ShowtimeResponse> UpdateAsync(Guid id, ShowtimeRequest r)
    {
        var s = await _db.Showtimes.SingleOrDefaultAsync(x => x.Id == id && x.DeletedAt == null)
            ?? throw ApiException.NotFound("showtime not found", "not_found");
        await using var tx = await _db.Database.BeginTransactionAsync();
        await _db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(hashtext({0}))", s.HallId.ToString());
        var hasLive = await _db.Bookings.AnyAsync(x => x.ShowtimeId == id
            && (x.Status == "pending" || x.Status == "confirmed"));
        var movieChanged = r.MovieId != Guid.Empty && r.MovieId != s.MovieId;
        var hallChanged = r.HallId != Guid.Empty && r.HallId != s.HallId;
        var timeChanged = r.StartAt != default && r.StartAt.ToUniversalTime() != s.StartAt;
        if (hasLive && (movieChanged || hallChanged || timeChanged))
            throw ApiException.Conflict("showtime has orders; only open/close allowed", "showtime_has_orders");
        var everOrdered = hasLive || await _db.Bookings.AnyAsync(x => x.ShowtimeId == id);
        if (hallChanged && everOrdered)
            throw ApiException.Conflict("showtime already ordered; cannot change hall", "showtime_has_orders");

        var m = await _db.Movies.SingleOrDefaultAsync(x => x.Id == (movieChanged ? r.MovieId : s.MovieId));
        if (m is null || m.DeletedAt != null)
            throw ApiException.BadRequest("movie not found", "movie_not_found");
        if (movieChanged && m.Status != "showing")
            throw ApiException.BadRequest("movie is not showing", "movie_not_showing");
        if (hallChanged)
        {
            var h = await _db.Halls.SingleOrDefaultAsync(x => x.Id == r.HallId && x.DeletedAt == null)
                ?? throw ApiException.BadRequest("hall not found", "hall_not_found");
            if (!h.Active) throw ApiException.BadRequest("hall is inactive", "hall_inactive");
            s.HallId = r.HallId;
        }
        if (movieChanged) s.MovieId = r.MovieId;
        var start = timeChanged
            ? (r.StartAt.Kind == DateTimeKind.Utc ? r.StartAt : r.StartAt.ToUniversalTime())
            : s.StartAt;
        if (timeChanged || movieChanged)
        {
            if (start <= DateTime.UtcNow.AddMinutes(5))
                throw ApiException.BadRequest("showtime starts too soon", "showtime_too_soon");
            s.StartAt = start;
            s.EndAt = start.AddMinutes(m.Duration);
            await GuardOverlapAsync(s.HallId, id, s.StartAt, s.EndAt);
        }
        if (r.Status != null)
        {
            if (r.Status is not ("open" or "closed"))
                throw ApiException.Validation(new() { ["status"] = "must be open or closed" });
            if (r.Status == "open")
            {
                if (m.Status != "showing" || s.StartAt <= DateTime.UtcNow)
                    throw ApiException.Conflict("cannot reopen", "showtime_cannot_reopen");
            }
            s.Status = r.Status;
        }
        s.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        if (hallChanged)
        {
            await _db.ShowtimeSeats.Where(x => x.ShowtimeId == id).ExecuteDeleteAsync();
            await BuildSeatsAsync(id, s.HallId, DateTime.UtcNow);
            await _db.SaveChangesAsync();
        }
        await tx.CommitAsync();
        var hh = await _db.Halls.AsNoTracking().SingleAsync(x => x.Id == s.HallId);
        return ToDto(s, m.Title, m.AgeRating, hh.Name);
    }

    public async Task DeleteAsync(Guid id)
    {
        await using var tx = await _db.Database.BeginTransactionAsync();
        var rows = await _db.Showtimes.FromSqlRaw("SELECT * FROM showtimes WHERE id = {0} FOR UPDATE", id)
            .ToListAsync();
        var s = rows.SingleOrDefault(x => x.DeletedAt == null)
            ?? throw ApiException.NotFound("showtime not found", "not_found");
        if (await _db.Bookings.AnyAsync(x => x.ShowtimeId == id))
            throw ApiException.Conflict("showtime has orders; close it instead", "showtime_has_orders");
        s.DeletedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        await tx.CommitAsync();
    }

    public async Task<object> CancelAsync(Guid id)
    {
        var s = await _db.Showtimes.SingleOrDefaultAsync(x => x.Id == id && x.DeletedAt == null)
            ?? throw ApiException.NotFound("showtime not found", "not_found");
        await using var tx = await _db.Database.BeginTransactionAsync();
        s.Status = "cancelled";
        var pendings = await _db.Bookings
            .Where(x => x.ShowtimeId == id && x.Status == "pending").ToListAsync();
        var now = DateTime.UtcNow;
        foreach (var b in pendings)
        {
            b.Status = "expired"; b.StatusReason = "showtime_cancelled"; b.UpdatedAt = now;
        }
        await _db.SaveChangesAsync();
        if (pendings.Count > 0)
        {
            var seatIds = await _db.BookingSeats
                .Where(x => pendings.Select(b => b.Id).Contains(x.BookingId))
                .Select(x => x.ShowtimeSeatId).ToListAsync();
            await _db.ShowtimeSeats.Where(x => seatIds.Contains(x.Id) && x.Status == "held")
                .ExecuteUpdateAsync(x => x
                    .SetProperty(t => t.Status, "available")
                    .SetProperty(t => t.HeldBy, (Guid?)null)
                    .SetProperty(t => t.HeldUntil, (DateTime?)null)
                    .SetProperty(t => t.UpdatedAt, now));
        }
        await tx.CommitAsync();
        return new { showtime_id = id, status = s.Status, bookings_affected = pendings.Count };
    }

    private async Task GuardOverlapAsync(Guid hallId, Guid? excludeId, DateTime start, DateTime end)
    {
        var buf = _cfg.GetValue("Booking:RoomCleanupMinutes", 20);
        var a = start.AddMinutes(-buf);
        var b = end.AddMinutes(buf);
        var clash = await _db.Showtimes.AnyAsync(x => x.HallId == hallId && x.DeletedAt == null
            && x.Id != excludeId && x.Status != "cancelled"
            && x.StartAt.AddMinutes(-buf) < b && x.EndAt.AddMinutes(buf) > a);
        if (clash) throw ApiException.Conflict("showtime overlaps another in this hall", "showtime_overlap");
    }

    private async Task BuildSeatsAsync(Guid showtimeId, Guid hallId, DateTime now)
    {
        var seats = await _db.Seats.Where(x => x.HallId == hallId && !x.IsGap).ToListAsync();
        foreach (var s in seats)
            _db.ShowtimeSeats.Add(new ShowtimeSeat
            {
                Id = Guid.NewGuid(),
                ShowtimeId = showtimeId,
                SeatId = s.Id,
                CreatedAt = now,
                UpdatedAt = now,
            });
    }

    private (DateTime From, DateTime To) DayRange(string? date)
    {
        var tz = TimeZoneInfo.FindSystemTimeZoneById(
            OperatingSystem.IsWindows() ? "SE Asia Standard Time" : "Asia/Ho_Chi_Minh");
        var day = date != null && DateOnly.TryParseExact(date, "yyyy-MM-dd", out var d)
            ? d : DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));
        var fromLocal = day.ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified);
        var from = TimeZoneInfo.ConvertTimeToUtc(fromLocal, tz);
        return (from, from.AddDays(1));
    }
}
