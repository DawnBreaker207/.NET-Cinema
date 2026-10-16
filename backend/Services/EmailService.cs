using Cinema.Api.Data;
using Cinema.Api.Models;
using Microsoft.EntityFrameworkCore;
using QRCoder;

namespace Cinema.Api.Services;

// Mirrors Go mock mailer: each ticket email becomes a .html file in outbox.
public sealed class EmailService
{
    private readonly CinemaDbContext _db;
    private readonly IConfiguration _cfg;
    public EmailService(CinemaDbContext db, IConfiguration cfg) { _db = db; _cfg = cfg; }

    public async Task<bool> SendForBookingAsync(Guid bookingId)
    {
        var b = await _db.Bookings.SingleOrDefaultAsync(x => x.Id == bookingId);
        if (b is null || b.Status != "confirmed" || b.EmailSentAt != null || b.EmailAttempts >= 6)
            return false;
        // Claim first (idempotent across cron + consumer).
        var claimed = await _db.Database.ExecuteSqlRawAsync(
            @"UPDATE bookings SET email_claimed_until = {0}, email_attempts = email_attempts + 1, updated_at = {0}
              WHERE id = {1} AND email_sent_at IS NULL
              AND (email_claimed_until IS NULL OR email_claimed_until <= {0})",
            DateTime.UtcNow.AddMinutes(5), bookingId);
        if (claimed == 0) return false;

        try
        {
            var tickets = await _db.Tickets.AsNoTracking()
                .Where(x => x.BookingId == bookingId).ToListAsync();
            var s = await _db.Showtimes.AsNoTracking().SingleAsync(x => x.Id == b.ShowtimeId);
            var m = await _db.Movies.AsNoTracking().SingleAsync(x => x.Id == s.MovieId);
            var dir = _cfg.GetValue("Mail:OutboxDir", "tmp/mail")!;
            Directory.CreateDirectory(dir);
            using var gen = new QRCodeGenerator();
            var sb = new System.Text.StringBuilder();
            sb.Append($"<html><body><h2>Your tickets — {System.Net.WebUtility.HtmlEncode(m.Title)}</h2>");
            sb.Append($"<p>Showtime: {s.StartAt:u} | Age rating: {m.AgeRating}</p>");
            foreach (var t in tickets)
            {
                using var data = gen.CreateQrCode(t.Code, QRCodeGenerator.ECCLevel.Q);
                using var png = new PngByteQRCode(data);
                sb.Append($"<div><p>Ticket {t.Code} — {t.Price:N0}₫</p><img src=\"data:image/png;base64,{Convert.ToBase64String(png.GetGraphic(10))}\"/></div>");
            }
            sb.Append("</body></html>");
            await File.WriteAllTextAsync(Path.Combine(dir, $"tickets-{bookingId}.html"), sb.ToString());
            b.EmailSentAt = DateTime.UtcNow;
            b.EmailClaimedUntil = null;
            await _db.SaveChangesAsync();
            return true;
        }
        catch
        {
            b.EmailClaimedUntil = null; // release claim; cron retries with backoff
            await _db.SaveChangesAsync();
            return false;
        }
    }
}
