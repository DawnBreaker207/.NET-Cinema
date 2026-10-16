using Cinema.Api.Common;
using Cinema.Api.Data;
using Cinema.Api.Dtos;
using Cinema.Api.Models;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using QRCoder;

namespace Cinema.Api.Services;

// Mirrors Go booking flows (F7/F12/F14/F22): init/hold/refresh/cancel,
// order views, discount attach, redeem, counter sell. Payment/finalize
// lives in PaymentService (next), sharing the same tables.
public sealed class BookingService
{
    private readonly CinemaDbContext _db;
    private readonly PricingService _pricing;
    private readonly IConfiguration _cfg;
    private readonly SseHub _sse;
    public BookingService(CinemaDbContext db, PricingService pricing, IConfiguration cfg, SseHub sse)
    { _db = db; _pricing = pricing; _cfg = cfg; _sse = sse; }

    private int HoldMinutes => _cfg.GetValue("Booking:HoldMinutes", 10);
    private int MaxLifetime => _cfg.GetValue("Booking:HoldMaxLifetimeMinutes", 15);
    private int MaxSeats => _cfg.GetValue("Booking:MaxSeatsPerOrder", 8);

    // ---- init: seatless PENDING for page-entry countdown ----
    public async Task<InitResponse> InitAsync(Guid uid, Guid showId)
    {
        var s = await LiveShowtimeAsync(showId);
        await using var tx = await _db.Database.BeginTransactionAsync();
        await AdvisoryAsync($"hold:{uid}:{showId}");
        var now = await DbNowAsync();
        var old = await _db.Bookings.SingleOrDefaultAsync(x =>
            x.UserId == uid && x.ShowtimeId == showId && x.Status == "pending");
        if (old is not null && old.ExpiresAt > now)
        {
            await tx.CommitAsync();
            return new InitResponse(old.Id, showId, old.ExpiresAt!.Value,
                (long)(old.ExpiresAt.Value - now).TotalSeconds, true);
        }
        if (old is not null) { old.Status = "expired"; old.StatusReason = "replaced"; }
        var exp = now.AddMinutes(HoldMinutes);
        var b = new Booking
        {
            Id = Guid.NewGuid(),
            UserId = uid,
            ShowtimeId = showId,
            ExpiresAt = exp,
            CreatedAt = now,
            UpdatedAt = now,
        };
        _db.Bookings.Add(b);
        try { await _db.SaveChangesAsync(); }
        catch (DbUpdateException ex) when (IsUnique(ex))
        {
            await tx.RollbackAsync();
            return await InitAsync(uid, showId);
        }
        await tx.CommitAsync();
        return new InitResponse(b.Id, showId, exp, HoldMinutes * 60L, false);
    }

    // ---- hold ----
    public async Task<HoldResponse> HoldAsync(Guid uid, HoldRequest r)
    {
        if (r.SeatIds.Count == 0) throw ApiException.Validation(new() { ["seat_ids"] = "required" });
        if (r.SeatIds.Count > MaxSeats)
            throw ApiException.BadRequest($"at most {MaxSeats} seats per order", "too_many_seats");
        if (r.IdempotencyKey is { Length: > 128 })
            throw ApiException.Validation(new() { ["idempotency_key"] = "at most 128 chars" });
        var seatIds = r.SeatIds.Distinct().OrderBy(x => x).ToList();

        await using var tx = await _db.Database.BeginTransactionAsync();
        await AdvisoryAsync($"hold:{uid}:{r.ShowId}");
        var now = await DbNowAsync();
        var s = await LiveShowtimeAsync(r.ShowId);

        // Idempotency: same key + same seats -> replay; key reuse otherwise -> 409.
        if (!string.IsNullOrEmpty(r.IdempotencyKey))
        {
            var prior = await _db.Bookings.SingleOrDefaultAsync(x =>
                x.IdempotencyKey == r.IdempotencyKey && x.Status == "pending");
            if (prior is not null)
            {
                if (prior.UserId != uid || prior.ShowtimeId != r.ShowId)
                    throw ApiException.Conflict("idempotency key already used", "idempotency_reused");
                var priorSeats = await _db.BookingSeats.Where(x => x.BookingId == prior.Id)
                    .Select(x => x.ShowtimeSeatId).OrderBy(x => x).ToListAsync();
                if (priorSeats.SequenceEqual(seatIds))
                {
                    await tx.CommitAsync();
                    return await ToHoldResponseAsync(prior, null);
                }
                throw ApiException.Conflict("idempotency key already used for other seats", "idempotency_reused");
            }
            if (await _db.Bookings.AnyAsync(x => x.IdempotencyKey == r.IdempotencyKey))
                throw ApiException.Conflict("idempotency key already used", "idempotency_reused");
        }

        var seats = await _db.ShowtimeSeats
            .FromSqlRaw("SELECT * FROM showtime_seats WHERE showtime_id = {0} AND id = ANY({1}) ORDER BY id FOR UPDATE",
                r.ShowId, seatIds.ToArray())
            .Join(_db.Seats.AsNoTracking(), ss => ss.SeatId, p => p.Id,
                (ss, p) => new { ss, p })
            .ToListAsync();
        if (seats.Count != seatIds.Count)
            throw ApiException.BadRequest("some seats do not belong to this showtime", "seat_not_found");
        if (seats.Any(x => x.p.IsGap))
            throw ApiException.BadRequest("aisle gap is not a seat", "seat_is_gap");

        var old = await _db.Bookings.SingleOrDefaultAsync(x =>
            x.UserId == uid && x.ShowtimeId == r.ShowId && x.Status == "pending");
        Guid? replaced = null;
        DateTime exp;
        if (old is not null)
        {
            if (await HasOpenAttemptAsync(old.Id))
                throw ApiException.Conflict("payment in progress for this showtime", "payment_in_progress");
            replaced = old.Id;
            exp = old.ExpiresAt ?? now.AddMinutes(HoldMinutes);
            if (exp <= now) exp = now.AddMinutes(HoldMinutes);
            // Release old seats not carried into the new set.
            var oldSeatIds = await _db.BookingSeats.Where(x => x.BookingId == old.Id)
                .Select(x => x.ShowtimeSeatId).ToListAsync();
            var drop = oldSeatIds.Except(seatIds).ToList();
            if (drop.Count > 0)
            {
                await _db.ShowtimeSeats.Where(x => drop.Contains(x.Id)
                        && x.Status == "held" && x.HeldBy == uid)
                    .ExecuteUpdateAsync(x => x
                        .SetProperty(t => t.Status, "available")
                        .SetProperty(t => t.HeldBy, (Guid?)null)
                        .SetProperty(t => t.HeldUntil, (DateTime?)null)
                        .SetProperty(t => t.UpdatedAt, now));
                _sse.Broadcast(r.ShowId.ToString(), "available", drop);
            }
            old.Status = "expired"; old.StatusReason = "replaced"; old.UpdatedAt = now;
        }
        else exp = now.AddMinutes(HoldMinutes);

        var types = seats.Select(x => x.p.SeatType).Distinct().ToList();
        var prices = await _pricing.QuoteForAsync(s.StartAt, types);
        var missing = types.FirstOrDefault(t => !prices.ContainsKey(t) || prices[t] <= 0);
        if (missing != null)
            throw ApiException.Conflict($"seat type {missing} has no price", "missing_price");

        var b = new Booking
        {
            Id = Guid.NewGuid(),
            UserId = uid,
            ShowtimeId = r.ShowId,
            TotalAmount = 0,
            ExpiresAt = exp,
            IdempotencyKey = r.IdempotencyKey,
            CreatedAt = now,
            UpdatedAt = now,
        };
        _db.Bookings.Add(b);
        await _db.SaveChangesAsync();

        var total = 0L;
        var bad = new List<string>();
        foreach (var x in seats)
        {
            var n = await _db.Database.ExecuteSqlRawAsync(
                @"UPDATE showtime_seats SET status='held', held_by={0}, held_until={1}, version=version+1, updated_at={2}
                  WHERE id={3} AND (status='available' OR (status='held' AND held_until <= {4}))",
                uid, exp, now, x.ss.Id, now);
            if (n == 0) bad.Add(x.p.RowLabel + x.p.ColNumber);
            else
            {
                var v = await _db.ShowtimeSeats.Where(t => t.Id == x.ss.Id)
                    .Select(t => t.Version).SingleAsync();
                var price = prices[x.p.SeatType];
                total += price;
                _db.BookingSeats.Add(new BookingSeat
                {
                    Id = Guid.NewGuid(),
                    BookingId = b.Id,
                    ShowtimeSeatId = x.ss.Id,
                    SeatType = x.p.SeatType,
                    Price = price,
                    HoldVersion = v,
                    CreatedAt = now,
                });
            }
        }
        if (bad.Count > 0)
        {
            await tx.RollbackAsync();
            throw ApiException.Conflict("some seats are no longer available: " + string.Join(",", bad),
                "seats_taken");
        }
        b.TotalAmount = total;
        try { await _db.SaveChangesAsync(); }
        catch (DbUpdateException ex) when (IsUnique(ex))
        {
            // Lost a race with another tab: retry once into merge path.
            await tx.RollbackAsync();
            return await HoldAsync(uid, r);
        }
        await tx.CommitAsync();
        _sse.Broadcast(r.ShowId.ToString(), "held", seatIds);
        return await ToHoldResponseAsync(b, replaced);
    }

    // ---- refresh (heartbeat; never extends past created+maxLifetime) ----
    public async Task<RefreshResponse> RefreshAsync(Guid uid, Guid bookingId)
    {
        await using var tx = await _db.Database.BeginTransactionAsync();
        await AdvisoryAsync($"refresh:{bookingId}");
        var now = await DbNowAsync();
        var b = await _db.Bookings.SingleOrDefaultAsync(x => x.Id == bookingId && x.UserId == uid)
            ?? throw ApiException.NotFound("order not found", "not_found");
        if (b.Status != "pending" || b.ExpiresAt <= now)
            throw ApiException.Conflict("order is no longer payable", "order_expired");
        if (await HasOpenAttemptAsync(b.Id))
            throw ApiException.Conflict("payment in progress", "payment_in_progress");
        var s = await LiveShowtimeAsync(b.ShowtimeId);
        var bs = await _db.BookingSeats.Where(x => x.BookingId == b.Id).ToListAsync();
        if (bs.Count == 0) throw ApiException.Conflict("order has no seats", "empty_order");
        var ids = bs.Select(x => x.ShowtimeSeatId).ToList();
        var kept = await _db.ShowtimeSeats.CountAsync(x => ids.Contains(x.Id)
            && x.Status == "held" && x.HeldBy == uid);
        if (kept != ids.Count)
            throw ApiException.Conflict("some seats were lost", "seats_lost");
        var cap = b.CreatedAt.AddMinutes(MaxLifetime);
        var next = now.AddMinutes(HoldMinutes);
        if (next > cap) throw ApiException.Conflict("hold lifetime exceeded", "hold_lifetime_exceeded");
        b.ExpiresAt = next; b.UpdatedAt = now;
        await _db.ShowtimeSeats.Where(x => ids.Contains(x.Id))
            .ExecuteUpdateAsync(x => x
                .SetProperty(t => t.HeldUntil, next)
                .SetProperty(t => t.UpdatedAt, now));
        await _db.SaveChangesAsync();
        await tx.CommitAsync();
        return new RefreshResponse(b.Id, next);
    }

    // ---- cancel ----
    public async Task CancelAsync(Guid uid, Guid bookingId)
    {
        await using var tx = await _db.Database.BeginTransactionAsync();
        var now = await DbNowAsync();
        var b = await _db.Bookings.SingleOrDefaultAsync(x => x.Id == bookingId && x.UserId == uid)
            ?? throw ApiException.NotFound("order not found", "not_found");
        if (b.Status != "pending")
            throw ApiException.Conflict("only pending orders can cancel", "order_not_pending");
        if (await HasOpenAttemptAsync(b.Id))
            throw ApiException.Conflict("payment in progress", "payment_in_progress");
        var ids = await _db.BookingSeats.Where(x => x.BookingId == b.Id)
            .Select(x => x.ShowtimeSeatId).ToListAsync();
        await _db.ShowtimeSeats.Where(x => ids.Contains(x.Id) && x.Status == "held" && x.HeldBy == uid)
            .ExecuteUpdateAsync(x => x
                .SetProperty(t => t.Status, "available")
                .SetProperty(t => t.HeldBy, (Guid?)null)
                .SetProperty(t => t.HeldUntil, (DateTime?)null)
                .SetProperty(t => t.UpdatedAt, now));
        b.Status = "expired"; b.StatusReason = "canceled"; b.UpdatedAt = now;
        await _db.SaveChangesAsync();
        await tx.CommitAsync();
        _sse.Broadcast(b.ShowtimeId.ToString(), "available", ids);
    }

    // ---- views ----
    public async Task<(IReadOnlyList<OrderStatusResponse> Items, long Total)> ListAsync(
        Guid uid, int page, int pageSize)
    {
        var q = _db.Bookings.AsNoTracking()
            .Where(x => x.UserId == uid).OrderByDescending(x => x.CreatedAt);
        var total = await q.LongCountAsync();
        var items = await q.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
        var out_ = new List<OrderStatusResponse>();
        foreach (var b in items) out_.Add(await ToStatusAsync(b));
        return (out_, total);
    }

    public async Task<OrderDetailResponse> DetailAsync(Guid uid, Guid bookingId, bool staff = false)
    {
        var b = await _db.Bookings.AsNoTracking().SingleOrDefaultAsync(x => x.Id == bookingId)
            ?? throw ApiException.NotFound("order not found", "not_found");
        if (!staff && b.UserId != uid)
            throw ApiException.Forbidden("not your order", "forbidden");
        var tickets = await _db.Tickets.AsNoTracking()
            .Where(x => x.BookingId == b.Id)
            .Join(_db.ShowtimeSeats.AsNoTracking(), t => t.ShowtimeSeatId, ss => ss.Id, (t, ss) => new { t, ss })
            .Join(_db.Seats.AsNoTracking(), x => x.ss.SeatId, s => s.Id,
                (x, s) => new TicketResponse(x.t.Id, x.t.ShowtimeSeatId, s.RowLabel + s.ColNumber,
                    "", x.t.Price, x.t.Code, x.t.Status))
            .ToListAsync();
        // seat_type from booking_seats
        var types = await _db.BookingSeats.AsNoTracking()
            .Where(x => x.BookingId == b.Id).ToDictionaryAsync(x => x.ShowtimeSeatId, x => x.SeatType);
        tickets = tickets.Select(t => t with { SeatType = types.GetValueOrDefault(t.ShowtimeSeatId, "") }).ToList();
        var st = await ToStatusAsync(b);
        return new OrderDetailResponse(st.Id, st.ShowtimeId, st.Status, st.StatusReason,
            st.TotalAmount, st.DiscountAmount, st.PayableAmount, st.CreatedAt,
            st.ExpiresAt, st.PaidAt, st.CollectedAt, st.Payment, st.Showtime, tickets);
    }

    public async Task<OrderStatusResponse> StatusAsync(Guid uid, Guid bookingId)
    {
        var b = await _db.Bookings.AsNoTracking().SingleOrDefaultAsync(x => x.Id == bookingId)
            ?? throw ApiException.NotFound("order not found", "not_found");
        if (b.UserId != uid) throw ApiException.Forbidden("not your order", "forbidden");
        return await ToStatusAsync(b);
    }

    // ---- discount ----
    public async Task<OrderStatusResponse> ApplyDiscountAsync(Guid uid, Guid bookingId, string code)
    {
        code = (code ?? "").Trim().ToUpperInvariant();
        if (code.Length == 0) throw ApiException.Validation(new() { ["code"] = "required" });
        await using var tx = await _db.Database.BeginTransactionAsync();
        var now = await DbNowAsync();
        var b = await _db.Bookings.SingleOrDefaultAsync(x => x.Id == bookingId && x.UserId == uid)
            ?? throw ApiException.NotFound("order not found", "not_found");
        if (b.Status != "pending" || b.ExpiresAt <= now)
            throw ApiException.Conflict("order is no longer payable", "order_expired");
        var dc = await _db.DiscountCodes.SingleOrDefaultAsync(x => x.Code == code && x.DeletedAt == null)
            ?? throw ApiException.BadRequest("unknown discount code", "discount_not_found");
        ValidateDiscount(dc, b.TotalAmount, now);
        if (await _db.DiscountRedemptions.AnyAsync(x => x.UserId == uid && x.DiscountCodeId == dc.Id))
            throw ApiException.Conflict("code already used", "discount_already_used");
        var amount = dc.Kind == "percent"
            ? Math.Min(b.TotalAmount * dc.Value / 100, dc.MaxDiscount ?? long.MaxValue)
            : Math.Min(dc.Value, b.TotalAmount);
        _db.DiscountRedemptions.Add(new DiscountRedemption
        { Id = Guid.NewGuid(), UserId = uid, DiscountCodeId = dc.Id, CreatedAt = now });
        try { await _db.SaveChangesAsync(); }
        catch (DbUpdateException ex) when (IsUnique(ex))
        {
            throw ApiException.Conflict("code already used", "discount_already_used");
        }
        b.DiscountCodeId = dc.Id; b.DiscountAmount = amount; b.UpdatedAt = now;
        await _db.SaveChangesAsync();
        await tx.CommitAsync();
        return await ToStatusAsync(b);
    }

    public async Task<OrderStatusResponse> RemoveDiscountAsync(Guid uid, Guid bookingId)
    {
        var b = await _db.Bookings.SingleOrDefaultAsync(x => x.Id == bookingId && x.UserId == uid)
            ?? throw ApiException.NotFound("order not found", "not_found");
        if (b.Status != "pending")
            throw ApiException.Conflict("order is no longer payable", "order_expired");
        if (b.DiscountCodeId != null)
        {
            await _db.DiscountRedemptions
                .Where(x => x.UserId == uid && x.DiscountCodeId == b.DiscountCodeId)
                .ExecuteDeleteAsync();
            b.DiscountCodeId = null; b.DiscountAmount = 0; b.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
        }
        return await ToStatusAsync(b);
    }

    // ---- redeem (staff gate check-in) ----
    public async Task<RedeemResponse> RedeemAsync(string ticketRef, Guid showtimeId)
    {
        var t = await _db.Tickets.SingleOrDefaultAsync(x => x.Id.ToString() == ticketRef || x.Code == ticketRef);
        if (t is null) return new RedeemResponse("not_found", null, null, null, null, null, null, null, null, null);
        var b = await _db.Bookings.AsNoTracking().SingleAsync(x => x.Id == t.BookingId);
        if (b.Status != "confirmed" || b.ShowtimeId != showtimeId)
            return await Info(t, "wrong_show");
        var s = await _db.Showtimes.AsNoTracking().SingleAsync(x => x.Id == b.ShowtimeId);
        var now = DateTime.UtcNow;
        var opens = s.StartAt.AddMinutes(-30);
        var closes = s.StartAt.AddMinutes(20);
        if (now < opens || now > closes)
        {
            var r = await Info(t, now < opens ? "too_early" : "closed");
            return r with { CheckinOpensAt = opens, CheckinClosesAt = closes };
        }
        var n = await _db.Database.ExecuteSqlRawAsync(
            "UPDATE tickets SET status='redeemed', updated_at={0} WHERE id={1} AND status='issued'", now, t.Id);
        if (n == 0) return await Info(t, "used");
        return await Info(t, "ok");
    }

    private async Task<RedeemResponse> Info(Ticket t, string status)
    {
        var b = await _db.Bookings.AsNoTracking().SingleAsync(x => x.Id == t.BookingId);
        var s = await _db.Showtimes.AsNoTracking().SingleAsync(x => x.Id == b.ShowtimeId);
        var m = await _db.Movies.AsNoTracking().SingleAsync(x => x.Id == s.MovieId);
        var h = await _db.Halls.AsNoTracking().SingleAsync(x => x.Id == s.HallId);
        var ss = await _db.ShowtimeSeats.AsNoTracking().SingleAsync(x => x.Id == t.ShowtimeSeatId);
        var seat = await _db.Seats.AsNoTracking().SingleAsync(x => x.Id == ss.SeatId);
        return new RedeemResponse(status, t.Id, s.Id, m.Title, m.AgeRating, h.Name,
            seat.RowLabel + seat.ColNumber, s.StartAt,
            s.StartAt.AddMinutes(-30), s.StartAt.AddMinutes(20));
    }

    // ---- ticket QR (base64 PNG) ----
    public async Task<TicketQrResponse> TicketQrAsync(Guid uid, string ticketRef, string role)
    {
        var t = await _db.Tickets.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id.ToString() == ticketRef || x.Code == ticketRef)
            ?? throw ApiException.NotFound("ticket not found", "not_found");
        var b = await _db.Bookings.AsNoTracking().SingleAsync(x => x.Id == t.BookingId);
        if (role is not ("admin" or "staff") && b.UserId != uid)
            throw ApiException.Forbidden("not your ticket", "forbidden");
        using var gen = new QRCodeGenerator();
        using var data = gen.CreateQrCode(t.Code, QRCodeGenerator.ECCLevel.Q);
        using var png = new PngByteQRCode(data);
        return new TicketQrResponse(t.Id, t.Code, Convert.ToBase64String(png.GetGraphic(20)));
    }

    // ---- counter sell (staff, walk-in: cash/POS, no account/provider) ----
    public async Task<OrderDetailResponse> CounterSellAsync(Guid sellerId, CounterSellRequest r)
    {
        if (r.SeatIds.Count == 0) throw ApiException.Validation(new() { ["seat_ids"] = "required" });
        var seatIds = r.SeatIds.Distinct().OrderBy(x => x).ToList();
        await using var tx = await _db.Database.BeginTransactionAsync();
        var now = await DbNowAsync();
        var s = await LiveShowtimeAsync(r.ShowId);
        var seats = await _db.ShowtimeSeats
            .FromSqlRaw("SELECT * FROM showtime_seats WHERE showtime_id = {0} AND id = ANY({1}) ORDER BY id FOR UPDATE",
                r.ShowId, seatIds.ToArray())
            .Join(_db.Seats.AsNoTracking(), ss => ss.SeatId, p => p.Id, (ss, p) => new { ss, p })
            .ToListAsync();
        if (seats.Count != seatIds.Count)
            throw ApiException.BadRequest("some seats do not belong to this showtime", "seat_not_found");
        var types = seats.Select(x => x.p.SeatType).Distinct().ToList();
        var prices = await _pricing.QuoteForAsync(s.StartAt, types);
        var b = new Booking
        {
            Id = Guid.NewGuid(),
            UserId = null,
            ShowtimeId = r.ShowId,
            Status = "confirmed",
            SoldVia = "counter",
            CustomerName = r.CustomerName,
            CustomerPhone = r.CustomerPhone,
            PaidAt = now,
            CreatedAt = now,
            UpdatedAt = now,
        };
        _db.Bookings.Add(b);
        await _db.SaveChangesAsync();
        var bad = new List<string>();
        foreach (var x in seats)
        {
            var n = await _db.Database.ExecuteSqlRawAsync(
                @"UPDATE showtime_seats SET status='sold', held_by=NULL, held_until=NULL, version=version+1, updated_at={0}
                  WHERE id={1} AND (status='available' OR (status='held' AND held_until <= {2}))",
                now, x.ss.Id, now);
            if (n == 0) bad.Add(x.p.RowLabel + x.p.ColNumber);
            else
            {
                var price = prices.GetValueOrDefault(x.p.SeatType);
                b.TotalAmount += price;
                _db.BookingSeats.Add(new BookingSeat
                {
                    Id = Guid.NewGuid(),
                    BookingId = b.Id,
                    ShowtimeSeatId = x.ss.Id,
                    SeatType = x.p.SeatType,
                    Price = price,
                    HoldVersion = x.ss.Version + 1,
                    CreatedAt = now,
                });
                _db.Tickets.Add(new Ticket
                {
                    Id = Guid.NewGuid(),
                    BookingId = b.Id,
                    ShowtimeSeatId = x.ss.Id,
                    Price = price,
                    Code = NewTicketCode(),
                    CreatedAt = now,
                    UpdatedAt = now,
                });
            }
        }
        if (bad.Count > 0)
        {
            await tx.RollbackAsync();
            throw ApiException.Conflict("some seats are no longer available: " + string.Join(",", bad), "seats_taken");
        }
        await _db.SaveChangesAsync();
        await tx.CommitAsync();
        _sse.Broadcast(r.ShowId.ToString(), "sold", seatIds);
        return await DetailAsync(sellerId, b.Id, staff: true);
    }

    // ---- shared helpers ----
    internal async Task<Showtime> LiveShowtimeAsync(Guid showId)
    {
        var s = await _db.Showtimes.FromSqlRaw("SELECT * FROM showtimes WHERE id = {0} FOR SHARE", showId)
            .SingleOrDefaultAsync() ?? throw ApiException.NotFound("showtime not found", "not_found");
        var now = DateTime.UtcNow;
        if (s.DeletedAt != null || s.StartAt <= now)
            throw ApiException.NotFound("showtime not found", "not_found");
        if (s.Status != "open") throw ApiException.Forbidden("showtime is closed", "showtime_closed");
        var m = await _db.Movies.AsNoTracking().SingleAsync(x => x.Id == s.MovieId);
        if (m.Status != "showing" || m.DeletedAt != null)
            throw ApiException.Forbidden("movie is not showing", "movie_not_showing");
        return s;
    }

    internal Task AdvisoryAsync(string key)
        => _db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(hashtext({0}))", key);

    internal async Task<DateTime> DbNowAsync()
        => (await _db.Database.SqlQueryRaw<DateTime>("SELECT now()").ToListAsync()).Single();

    internal static bool IsUnique(DbUpdateException ex)
        => ex.InnerException is PostgresException pg && pg.SqlState == "23505";

    internal static string NewTicketCode()
        => Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(6)).ToLowerInvariant();

    internal Task<bool> HasOpenAttemptAsync(Guid bookingId)
        => _db.Payments.AnyAsync(x => x.BookingId == bookingId && x.Status == "pending");

    private static void ValidateDiscount(DiscountCode dc, long total, DateTime now)
    {
        if (!dc.Active) throw ApiException.BadRequest("code is inactive", "discount_inactive");
        if ((dc.StartsAt != null && now < dc.StartsAt) || (dc.EndsAt != null && now > dc.EndsAt))
            throw ApiException.BadRequest("code expired", "discount_expired");
        if (total < dc.MinOrder) throw ApiException.BadRequest("order below minimum", "discount_min_order");
        if (dc.MaxUses != null && dc.UsedCount >= dc.MaxUses)
            throw ApiException.BadRequest("code fully used", "discount_maxed");
    }

    private async Task<HoldResponse> ToHoldResponseAsync(Booking b, Guid? replaced)
    {
        var bs = await _db.BookingSeats.Where(x => x.BookingId == b.Id).ToListAsync();
        var ids = bs.Select(x => x.ShowtimeSeatId).ToList();
        var labels = await _db.ShowtimeSeats.AsNoTracking().Where(x => ids.Contains(x.Id))
            .Join(_db.Seats.AsNoTracking(), ss => ss.SeatId, p => p.Id,
                (ss, p) => new { ss, p }).ToDictionaryAsync(x => x.ss.Id, x => x.p);
        return new HoldResponse(b.Id, b.ShowtimeId, b.TotalAmount, b.ExpiresAt!.Value,
            bs.Select(x => new HeldSeat(x.ShowtimeSeatId,
                labels[x.ShowtimeSeatId].RowLabel + labels[x.ShowtimeSeatId].ColNumber,
                labels[x.ShowtimeSeatId].RowLabel, labels[x.ShowtimeSeatId].ColNumber,
                x.SeatType, x.Price)).ToList(), replaced);
    }

    public async Task<List<object>> TransactionsAsync(Guid uid)
    {
        var rows = await _db.Payments.AsNoTracking()
            .Join(_db.Bookings.AsNoTracking(), p => p.BookingId, b => b.Id, (p, b) => new { p, b })
            .Where(x => x.b.UserId == uid)
            .OrderByDescending(x => x.p.CreatedAt).Take(100).ToListAsync();
        return rows.Select(x => (object)new
        {
            payment_id = x.p.Id,
            booking_id = x.b.Id,
            provider = x.p.Provider,
            status = x.p.Status,
            amount = x.p.Amount,
            paid_amount = x.p.PaidAmount,
            created_at = x.p.CreatedAt,
            paid_at = x.p.PaidAt,
        }).ToList();
    }

    internal async Task<OrderStatusResponse> ToStatusAsync(Booking b)
    {
        PaymentSummary? pay = null;
        if (b.PaymentId != null)
        {
            var p = await _db.Payments.AsNoTracking().SingleOrDefaultAsync(x => x.Id == b.PaymentId);
            if (p != null) pay = new PaymentSummary(p.Id, p.Provider, p.TxnRef, p.Status, p.StatusReason,
                p.Amount, p.PaidAmount, p.PaidAt, p.RefundedAt);
        }
        OrderShowtime? st = null;
        var s = await _db.Showtimes.AsNoTracking().SingleOrDefaultAsync(x => x.Id == b.ShowtimeId);
        if (s != null)
        {
            var m = await _db.Movies.AsNoTracking().SingleAsync(x => x.Id == s.MovieId);
            var h = await _db.Halls.AsNoTracking().SingleAsync(x => x.Id == s.HallId);
            var now = DateTime.UtcNow;
            st = new OrderShowtime(s.MovieId, m.Title, m.AgeRating, s.HallId, h.Name,
                s.StartAt, s.EndAt, s.StartAt <= now, s.EndAt <= now);
        }
        return new OrderStatusResponse(b.Id, b.ShowtimeId, b.Status, b.StatusReason,
            b.TotalAmount, b.DiscountAmount, b.TotalAmount - b.DiscountAmount,
            b.CreatedAt, b.ExpiresAt, b.PaidAt, b.CollectedAt, pay, st);
    }
}
