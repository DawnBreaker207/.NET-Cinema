using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using Cinema.Api.Common;
using Cinema.Api.Data;
using Cinema.Api.Dtos;
using Cinema.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Cinema.Api.Services;

// Mirrors Go payment core (F8/F9): open attempts per provider, mock provider
// with HMAC-signed IPN/return, single finalize() used by IPN/reconcile/confirm.
public sealed class PaymentService
{
    private sealed record MockTxn(Guid PaymentId, Guid BookingId, long Amount, string Status);
    private static readonly ConcurrentDictionary<string, MockTxn> MockTxns = new();

    private readonly CinemaDbContext _db;
    private readonly BookingService _bookings;
    private readonly SseHub _sse;
    private readonly IConfiguration _cfg;
    private readonly IHttpClientFactory _http;
    private readonly IServiceScopeFactory _scopes;
    public PaymentService(CinemaDbContext db, BookingService bookings,
        SseHub sse, IConfiguration cfg, IHttpClientFactory http, IServiceScopeFactory scopes)
    { _db = db; _bookings = bookings; _sse = sse; _cfg = cfg; _http = http; _scopes = scopes; }

    private string MockSecret => _cfg.GetValue("Payment:MockSecret", "dev-mock-secret-change-me")!;
    private string BaseUrl => _cfg.GetValue("Payment:PublicBaseUrl", "http://localhost:5000")!.TrimEnd('/');
    private string FrontendUrl => _cfg.GetValue("Payment:ReturnRedirectUrl", "http://localhost:5173")!.TrimEnd('/');

    public object Providers() => new[]
    {
        new { name = "mock", display_name = "Mock gateway", enabled = _cfg.GetValue("Payment:MockEnabled", true) },
    };

    public static string Sign(string secret, string payload)
    {
        using var h = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        return Convert.ToHexString(h.ComputeHash(Encoding.UTF8.GetBytes(payload))).ToLowerInvariant();
    }

    // ---- pay: create or reuse an open attempt ----
    public async Task<PayResponse> PayAsync(Guid uid, Guid bookingId, string? provider)
    {
        provider = string.IsNullOrEmpty(provider) ? _cfg.GetValue("Payment:DefaultProvider", "mock")! : provider;
        if (provider != "mock") throw ApiException.BadRequest("unknown provider", "unknown_provider");
        var now = DateTime.UtcNow;
        var b = await _db.Bookings.SingleOrDefaultAsync(x => x.Id == bookingId && x.UserId == uid)
            ?? throw ApiException.NotFound("order not found", "not_found");
        if (b.Status != "pending" || b.ExpiresAt <= now)
            throw ApiException.Conflict("order is no longer payable", "order_expired");
        var bs = await _db.BookingSeats.CountAsync(x => x.BookingId == b.Id);
        if (bs == 0) throw ApiException.Conflict("order has no seats", "empty_order");
        // Showtime still open (advisory race with admin close is settled at finalize).
        await _bookings.LiveShowtimeAsync(b.ShowtimeId);

        var payable = b.TotalAmount - b.DiscountAmount;
        var open = await _db.Payments.SingleOrDefaultAsync(x =>
            x.BookingId == b.Id && x.Provider == provider && x.Status == "pending");
        if (open is not null && open.Amount == payable)
            return new PayResponse(open.Id, provider, open.TxnRef, open.RedirectUrl ?? "", open.ExpiresAt);
        if (open is not null && open.Amount != payable)
        {
            open.Status = "failed"; open.StatusReason = "amount_changed"; open.UpdatedAt = now;
        }
        var txnRef = "MOCK" + DateTime.UtcNow.ToString("yyyyMMddHHmmssfff") + RandomNumberGenerator.GetInt32(100, 999);
        var p = new Payment
        {
            Id = Guid.NewGuid(),
            BookingId = b.Id,
            Provider = provider,
            TxnRef = txnRef,
            Amount = payable,
            RedirectUrl = $"{BaseUrl}/mock-gateway/checkout?ref={txnRef}",
            ExpiresAt = b.ExpiresAt,
            CreatedAt = now,
            UpdatedAt = now,
        };
        _db.Payments.Add(p);
        await _db.SaveChangesAsync();
        MockTxns[txnRef] = new MockTxn(p.Id, b.Id, payable, "pending");
        return new PayResponse(p.Id, provider, txnRef, p.RedirectUrl!, p.ExpiresAt);
    }

    // ---- IPN (no JWT; HMAC is the credential) ----
    public async Task<object> NotifyAsync(string provider, string txnRef, long amount,
        string status, string providerTxnId, string sig)
    {
        if (provider != "mock") throw ApiException.NotFound("unknown provider", "unknown_provider");
        var expect = Sign(MockSecret, $"{txnRef}|{amount}|{status}");
        if (!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(expect), Encoding.UTF8.GetBytes(sig)))
            throw new ApiException(401, 97, "invalid signature", "bad_signature");
        var p = await _db.Payments.SingleOrDefaultAsync(x => x.Provider == provider && x.TxnRef == txnRef)
            ?? throw ApiException.NotFound("unknown transaction", "unknown_transaction");
        if (status == "failed")
        {
            if (p.Status == "pending")
            {
                p.Status = "failed"; p.StatusReason = "declined"; p.UpdatedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync();
            }
            return new { ok = true };
        }
        // status == paid
        MockTxns.AddOrUpdate(txnRef,
            new MockTxn(p.Id, p.BookingId, amount, "paid"),
            (_, old) => old with { Status = "paid", Amount = amount });
        await FinalizeAsync(p.Id, amount, providerTxnId);
        return new { ok = true };
    }

    // ---- return URL: never trust the redirect; reconcile from provider state ----
    public async Task<string> ReturnAsync(string provider, string txnRef, string status, string sig)
    {
        var expect = Sign(MockSecret, $"{txnRef}|{status}");
        if (!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(expect), Encoding.UTF8.GetBytes(sig)))
            throw new ApiException(401, 97, "invalid signature", "bad_signature");
        string bookingId = "", payStatus = "pending";
        if (MockTxns.TryGetValue(txnRef, out var txn))
        {
            bookingId = txn.BookingId.ToString();
            var p = await _db.Payments.AsNoTracking().SingleOrDefaultAsync(x => x.Id == txn.PaymentId);
            if (p != null)
            {
                if (txn.Status == "paid") await FinalizeAsync(p.Id, txn.Amount, txnRef);
                var cur = await _db.Payments.AsNoTracking().SingleAsync(x => x.Id == p.Id);
                payStatus = cur.Status == "paid" || (await _db.Bookings.AsNoTracking()
                    .SingleAsync(x => x.Id == cur.BookingId)).Status == "confirmed" ? "paid" : cur.Status;
                var b = await _db.Bookings.AsNoTracking().SingleAsync(x => x.Id == cur.BookingId);
                payStatus = b.Status switch
                {
                    "confirmed" => "paid",
                    "refunded" => "refunded",
                    "expired" => "expired",
                    _ => cur.Status,
                };
            }
        }
        return $"{FrontendUrl}/payment-result?booking_id={bookingId}&status={payStatus}";
    }

    // ---- reconcile when the customer comes back without IPN ----
    public async Task<OrderStatusResponse> ReconcileAsync(Guid uid, Guid bookingId)
    {
        var b = await _db.Bookings.SingleOrDefaultAsync(x => x.Id == bookingId && x.UserId == uid)
            ?? throw ApiException.NotFound("order not found", "not_found");
        var attempts = await _db.Payments.Where(x => x.BookingId == b.Id && x.Status == "pending").ToListAsync();
        foreach (var a in attempts)
        {
            if (MockTxns.TryGetValue(a.TxnRef, out var txn) && txn.Status == "paid")
                await FinalizeAsync(a.Id, txn.Amount, a.TxnRef);
        }
        // Late-capture sweep for failed/abandoned attempts inside 24h is done by the job;
        // here just refresh the view.
        var fresh = await _db.Bookings.AsNoTracking().SingleAsync(x => x.Id == bookingId);
        return await _bookings.ToStatusAsync(fresh);
    }

    // ---- the single finalize path (IPN / return / confirm / sweep) ----
    public async Task FinalizeAsync(Guid paymentId, long paidAmount, string? providerTxnId)
    {
        await using var tx = await _db.Database.BeginTransactionAsync();
        var now = await _bookings.DbNowAsync();
        var rows = await _db.Bookings
            .FromSqlRaw("SELECT * FROM bookings WHERE id = (SELECT booking_id FROM payments WHERE id = {0}) FOR UPDATE", paymentId)
            .ToListAsync();
        var b = rows.SingleOrDefault();
        var p = await _db.Payments.SingleOrDefaultAsync(x => x.Id == paymentId);
        if (b is null || p is null) { await tx.RollbackAsync(); return; }
        if (p.BookingId != b.Id) { await tx.RollbackAsync(); return; }
        if (b.Status == "confirmed") { await tx.CommitAsync(); return; } // idempotent
        if (b.Status is "expired" or "refunded") { await tx.RollbackAsync(); return; }

        var payable = b.TotalAmount - b.DiscountAmount;
        string? fail = null;
        if (paidAmount != payable) fail = "amount_mismatch";
        Showtime? s = null;
        if (fail is null)
        {
            s = await _db.Showtimes.SingleOrDefaultAsync(x => x.Id == b.ShowtimeId);
            var m = s is null ? null
                : await _db.Movies.AsNoTracking().SingleOrDefaultAsync(x => x.Id == s.MovieId);
            if (s is null || s.DeletedAt != null || s.Status != "open" || s.StartAt <= now
                || m is null || m.DeletedAt != null || m.Status != "showing")
                fail = "showtime_invalid";
        }
        List<BookingSeat> bs = new();
        if (fail is null)
        {
            if (b.ExpiresAt <= now) fail = "hold_expired";
            else
            {
                bs = await _db.BookingSeats.Where(x => x.BookingId == b.Id).ToListAsync();
                var ids = bs.Select(x => x.ShowtimeSeatId).ToList();
                var held = await _db.ShowtimeSeats.Where(x => ids.Contains(x.Id)).ToListAsync();
                if (held.Any(x => x.Status != "held" || x.HeldBy != b.UserId
                    || x.HeldUntil <= now || bs.Single(y => y.ShowtimeSeatId == x.Id).HoldVersion != x.Version))
                    fail = "seats_lost";
            }
        }

        if (fail is null)
        {
            // CAS each seat held->sold, then confirm + tickets.
            foreach (var seat in await _db.ShowtimeSeats.Where(x =>
                bs.Select(y => y.ShowtimeSeatId).Contains(x.Id)).ToListAsync())
            {
                seat.Status = "sold"; seat.HeldBy = null; seat.HeldUntil = null; seat.UpdatedAt = now;
            }
            b.Status = "confirmed"; b.StatusReason = null; b.PaidAt = now; b.UpdatedAt = now;
            b.PaymentId = p.Id;
            p.Status = "paid"; p.PaidAmount = paidAmount; p.PaidAt = now;
            p.ProviderTxnId = providerTxnId; p.UpdatedAt = now;
            foreach (var x in bs)
                _db.Tickets.Add(new Ticket
                {
                    Id = Guid.NewGuid(),
                    BookingId = b.Id,
                    ShowtimeSeatId = x.ShowtimeSeatId,
                    Price = x.Price,
                    Code = BookingService.NewTicketCode(),
                    CreatedAt = now,
                    UpdatedAt = now,
                });
            await _db.SaveChangesAsync();
            await tx.CommitAsync();
            _sse.Broadcast(b.ShowtimeId.ToString(), "sold", bs.Select(x => x.ShowtimeSeatId).ToList());
            var emailBid = b.Id;
            _ = Task.Run(async () =>
            {
                try
                {
                    using var scope = _scopes.CreateScope();
                    await scope.ServiceProvider.GetRequiredService<EmailService>()
                        .SendForBookingAsync(emailBid);
                }
                catch { /* the 2-minute job retries */ }
            });
            return;
        }

        // Cannot issue tickets: release kept seats, mark refund, refund after commit.
        var keepIds = bs.Select(x => x.ShowtimeSeatId).ToList();
        await _db.ShowtimeSeats.Where(x => keepIds.Contains(x.Id) && x.Status == "held" && x.HeldBy == b.UserId)
            .ExecuteUpdateAsync(x => x
                .SetProperty(t => t.Status, "available")
                .SetProperty(t => t.HeldBy, (Guid?)null)
                .SetProperty(t => t.HeldUntil, (DateTime?)null)
                .SetProperty(t => t.UpdatedAt, now));
        b.Status = "refunded"; b.StatusReason = fail; b.UpdatedAt = now;
        p.Status = "refund_pending"; p.StatusReason = fail; p.PaidAmount = paidAmount;
        p.PaidAt = now; p.UpdatedAt = now;
        await _db.SaveChangesAsync();
        await tx.CommitAsync();
        _sse.Broadcast(b.ShowtimeId.ToString(), "available", keepIds);
        await TryRefundAsync(p.Id);
    }

    public async Task TryRefundAsync(Guid paymentId)
    {
        var p = await _db.Payments.SingleOrDefaultAsync(x => x.Id == paymentId);
        if (p is null || p.Status is not ("refund_pending" or "paid")) return;
        // Mock provider refunds instantly for the exact captured amount.
        p.Status = "refunded"; p.RefundedAt = DateTime.UtcNow; p.UpdatedAt = DateTime.UtcNow;
        p.RefundAttempts += 1;
        await _db.SaveChangesAsync();
    }

    // ---- mock gateway helpers (used by MockGatewayController) ----
    public bool MockGet(string txnRef, out Guid paymentId, out Guid bookingId, out long amount)
    {
        if (MockTxns.TryGetValue(txnRef, out var t))
        {
            (paymentId, bookingId, amount) = (t.PaymentId, t.BookingId, t.Amount);
            return true;
        }
        (paymentId, bookingId, amount) = (Guid.Empty, Guid.Empty, 0);
        return false;
    }

    public string MockSignIpn(string txnRef, long amount, string status)
        => Sign(MockSecret, $"{txnRef}|{amount}|{status}");

    public string MockSignReturn(string txnRef, string status)
        => Sign(MockSecret, $"{txnRef}|{status}");

    public void MockSet(string txnRef, string status, long amount)
        => MockTxns.AddOrUpdate(txnRef, new MockTxn(Guid.Empty, Guid.Empty, amount, status),
            (_, old) => old with { Status = status, Amount = amount });

    public async Task FireIpnAsync(string txnRef, long amount, string status)
    {
        var url = $"{BaseUrl}/api/v1/payments/mock/ipn?txn_ref={txnRef}&amount={amount}&status={status}&provider_txn_id={txnRef}&sig={MockSignIpn(txnRef, amount, status)}";
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        await _http.CreateClient().GetAsync(url, cts.Token);
    }
}
