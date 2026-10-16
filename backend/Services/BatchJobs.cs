using System.Text.Json;
using Cinema.Api.Common;
using Cinema.Api.Data;
using Cinema.Api.Models;
using Cinema.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace Cinema.Api.Services;

// Background jobs (Go F10/F17/F21): sweep, ticket emails, closeDay, cleanup.
// Registered in DI; timers in JobsHostedService; manual runs via admin API.
public sealed class BatchJobs
{
    private readonly IServiceScopeFactory _scopes;
    public BatchJobs(IServiceScopeFactory scopes) => _scopes = scopes;

    public async Task RunAsync(string name, string triggeredBy)
    {
        using var scope = _scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CinemaDbContext>();
        var now = DateTime.UtcNow;
        var job = new BatchJob
        {
            Id = Guid.NewGuid(),
            JobName = name,
            TriggeredBy = triggeredBy,
            StartedAt = now,
            CreatedAt = now,
        };
        db.BatchJobs.Add(job);
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateException ex) when (BookingService.IsUnique(ex))
        {
            return; // one running instance per job
        }
        try
        {
            var (processed, skipped) = name switch
            {
                "sweepExpiredHolds" => await SweepAsync(scope),
                "sendTicketEmails" => await EmailsAsync(scope),
                "closeDay" => await CloseDayAsync(scope),
                "cleanup" => await CleanupAsync(scope),
                _ => throw ApiException.BadRequest("unknown job", "unknown_job"),
            };
            job.Status = "success"; job.ProcessedRows = processed; job.SkippedRows = skipped;
        }
        catch (Exception ex)
        {
            job.Status = "failed"; job.ErrorMessage = ex.Message[..Math.Min(ex.Message.Length, 2000)];
        }
        job.FinishedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
    }

    private static async Task<(int, int)> SweepAsync(IServiceScope scope)
    {
        var sp = scope.ServiceProvider;
        var db = sp.GetRequiredService<CinemaDbContext>();
        var pay = sp.GetRequiredService<PaymentService>();
        var sse = sp.GetRequiredService<SseHub>();
        var now = DateTime.UtcNow;
        var processed = 0;

        // a. Release expired HELD seats without ever waiting on row locks.
        var released = await db.Database.SqlQueryRaw<ReleasedSeat>(
            @"UPDATE showtime_seats SET status='available', held_by=NULL, held_until=NULL, updated_at={0}
              WHERE ctid IN (SELECT ctid FROM showtime_seats WHERE status='held' AND held_until <= {0}
                             FOR UPDATE SKIP LOCKED)
              RETURNING showtime_id AS ShowtimeId, id AS Id", now).ToListAsync();
        foreach (var g in released.GroupBy(x => x.ShowtimeId))
            sse.Broadcast(g.Key.ToString(), "available", g.Select(x => x.Id).ToList());
        processed += released.Count;

        // b. Expire unpaid overdue bookings; finalize paid-but-stuck ones.
        var overdue = await db.Bookings
            .Where(x => x.Status == "pending" && x.ExpiresAt <= now).ToListAsync();
        foreach (var b in overdue)
        {
            if (b.PaymentId == null)
            {
                b.Status = "expired"; b.StatusReason = "ttl"; b.UpdatedAt = now; processed++;
            }
        }
        await db.SaveChangesAsync();
        var stuck = await db.Payments.Where(x => x.Status == "paid").Take(50).ToListAsync();
        foreach (var p in stuck)
        {
            var b = await db.Bookings.SingleOrDefaultAsync(x => x.Id == p.BookingId);
            if (b?.Status == "pending") { await pay.FinalizeAsync(p.Id, p.PaidAmount ?? p.Amount, p.ProviderTxnId); processed++; }
        }

        // c. Retry refunds.
        var refunds = await db.Payments.Where(x => x.Status == "refund_pending").Take(50).ToListAsync();
        foreach (var p in refunds) { await pay.TryRefundAsync(p.Id); processed++; }

        // d. Reconcile open attempts; abandon ones long past expiry.
        var opens = await db.Payments.Where(x => x.Status == "pending").Take(100).ToListAsync();
        foreach (var p in opens)
        {
            var b = await db.Bookings.AsNoTracking().SingleOrDefaultAsync(x => x.Id == p.BookingId);
            if (b is null) continue;
            if (pay.MockGet(p.TxnRef, out _, out _, out var amt))
            {
                // mock says paid?
                await pay.FinalizeAsync(p.Id, amt, p.TxnRef); processed++;
            }
            else if (b.ExpiresAt != null && b.ExpiresAt.Value.AddMinutes(15) <= now)
            {
                p.Status = "failed"; p.StatusReason = "abandoned"; p.UpdatedAt = now; processed++;
            }
        }
        await db.SaveChangesAsync();
        return (processed, 0);
    }

    private sealed class ReleasedSeat
    {
        public Guid ShowtimeId { get; set; }
        public Guid Id { get; set; }
    }

    private static async Task<(int, int)> EmailsAsync(IServiceScope scope)
    {
        var sp = scope.ServiceProvider;
        var db = sp.GetRequiredService<CinemaDbContext>();
        var email = sp.GetRequiredService<EmailService>();
        var ids = await db.Bookings.AsNoTracking()
            .Where(x => x.Status == "confirmed" && x.EmailSentAt == null && x.EmailAttempts < 6)
            .OrderBy(x => x.CreatedAt).Take(100).Select(x => x.Id).ToListAsync();
        var n = 0;
        foreach (var id in ids) if (await email.SendForBookingAsync(id)) n++;
        return (n, ids.Count - n);
    }

    private static async Task<(int, int)> CloseDayAsync(IServiceScope scope)
    {
        var db = scope.ServiceProvider.GetRequiredService<CinemaDbContext>();
        var tz = TimeZoneInfo.FindSystemTimeZoneById(
            OperatingSystem.IsWindows() ? "SE Asia Standard Time" : "Asia/Ho_Chi_Minh");
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));
        var n = 0;
        foreach (var day in new[] { today.AddDays(-1), today })
        {
            var from = TimeZoneInfo.ConvertTimeToUtc(day.ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified), tz);
            var to = from.AddDays(1);
            var orders = await db.Bookings.AsNoTracking()
                .Where(x => x.Status == "confirmed" && x.PaidAt >= from && x.PaidAt < to).ToListAsync();
            var shows = await db.Showtimes.AsNoTracking()
                .Where(x => x.StartAt >= from && x.StartAt < to && x.DeletedAt == null)
                .OrderBy(x => x.StartAt).ToListAsync();
            var stIds = shows.Select(x => x.Id).ToList();
            // Per-show seat rows: capacity counts non-gap showtime seats (Go COUNT(ss.id) FILTER (NOT s.is_gap)).
            var ssRows = await db.ShowtimeSeats.AsNoTracking()
                .Where(x => stIds.Contains(x.ShowtimeId)).ToListAsync();
            var seatIds = ssRows.Select(x => x.SeatId).Distinct().ToList();
            var seatMap = await db.Seats.AsNoTracking()
                .Where(x => seatIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id);
            var sold = ssRows.Count(x => x.Status == "sold");
            // Breakdown JSON (Go upsertDailyAggregateSQL): confirmed bookings per showtime, any paid date.
            var movieIds = shows.Select(x => x.MovieId).Distinct().ToList();
            var hallIds = shows.Select(x => x.HallId).Distinct().ToList();
            var titles = await db.Movies.AsNoTracking()
                .Where(x => movieIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.Title);
            var hallNames = await db.Halls.AsNoTracking()
                .Where(x => hallIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.Name);
            var showOrders = await db.Bookings.AsNoTracking()
                .Where(x => x.Status == "confirmed" && stIds.Contains(x.ShowtimeId)).ToListAsync();
            var soIds = showOrders.Select(x => x.Id).ToList();
            var showTickets = await db.Tickets.AsNoTracking()
                .Where(x => soIds.Contains(x.BookingId)).ToListAsync();
            var bookingShow = showOrders.ToDictionary(x => x.Id, x => x.ShowtimeId);
            var breakdown = new
            {
                showtimes = shows.Select(s => new
                {
                    showtime_id = s.Id,
                    movie = titles.TryGetValue(s.MovieId, out var ttl) ? ttl : "",
                    hall = hallNames.TryGetValue(s.HallId, out var nm) ? nm : "",
                    start_at = s.StartAt,
                    capacity = ssRows.Count(x => x.ShowtimeId == s.Id
                        && seatMap.TryGetValue(x.SeatId, out var p) && !p.IsGap),
                    seats_sold = ssRows.Count(x => x.ShowtimeId == s.Id && x.Status == "sold"),
                    checked_in = showTickets.Count(t => t.Status == "redeemed"
                        && bookingShow.TryGetValue(t.BookingId, out var sid) && sid == s.Id),
                    revenue = showOrders.Where(b => b.ShowtimeId == s.Id).Sum(b => b.TotalAmount),
                }).ToList(),
            };
            var agg = await db.DailyAggregates.SingleOrDefaultAsync(x => x.ReportDate == day);
            var now = DateTime.UtcNow;
            if (agg is null)
            {
                agg = new DailyAggregate { Id = Guid.NewGuid(), ReportDate = day, CreatedAt = now };
                db.DailyAggregates.Add(agg);
            }
            // Go sums bookings.total_amount (the undiscounted subtotal) - never total - discount.
            agg.TotalRevenue = orders.Sum(x => x.TotalAmount);
            agg.TicketsSold = await db.Tickets.AsNoTracking()
                .Where(t => orders.Select(o => o.Id).Contains(t.BookingId)).CountAsync();
            agg.SeatsSold = sold;
            agg.Capacity = ssRows.Count(x => seatMap.TryGetValue(x.SeatId, out var p) && !p.IsGap);
            agg.OccupancyRate = agg.Capacity == 0 ? 0 : Math.Round((decimal)sold * 100 / agg.Capacity, 2);
            agg.Breakdown = JsonSerializer.Serialize(breakdown);
            agg.UpdatedAt = now;
            n++;
        }
        await db.SaveChangesAsync();
        return (n, 0);
    }

    private static async Task<(int, int)> CleanupAsync(IServiceScope scope)
    {
        var db = scope.ServiceProvider.GetRequiredService<CinemaDbContext>();
        var now = DateTime.UtcNow;
        var auditDays = 90;
        var a = await db.AuditLogs.Where(x => x.CreatedAt < now.AddDays(-auditDays)).ExecuteDeleteAsync();
        var t = await db.RefreshTokens.Where(x => x.ExpiresAt < now.AddDays(-1)).ExecuteDeleteAsync();
        var p = await db.PasswordResetTokens
            .Where(x => x.UsedAt != null || x.ExpiresAt < now.AddDays(-1)).ExecuteDeleteAsync();
        var old = await db.BatchJobs.Where(x => x.StartedAt < now.AddDays(-auditDays)).ExecuteDeleteAsync();
        return (a + t + p + old, 0);
    }
}

public sealed class JobsHostedService : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    public JobsHostedService(IServiceScopeFactory scopes) => _scopes = scopes;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30));
        var lastDaily = DateOnly.MinValue;
        var tick = 0;
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            tick++;
            try
            {
                using var scope = _scopes.CreateScope();
                var jobs = scope.ServiceProvider.GetRequiredService<BatchJobs>();
                await jobs.RunAsync("sweepExpiredHolds", "cron");
                if (tick % 4 == 0) await jobs.RunAsync("sendTicketEmails", "cron");
                var tz = TimeZoneInfo.FindSystemTimeZoneById(
                    OperatingSystem.IsWindows() ? "SE Asia Standard Time" : "Asia/Ho_Chi_Minh");
                var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));
                if (lastDaily != today)
                {
                    lastDaily = today;
                    await jobs.RunAsync("closeDay", "cron");
                    await jobs.RunAsync("cleanup", "cron");
                }
            }
            catch (OperationCanceledException) { }
            catch { /* failures are recorded in batch_jobs; never crash the host */ }
        }
    }
}
