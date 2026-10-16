using Cinema.Api.Common;
using Cinema.Api.Data;
using Cinema.Api.Dtos;
using Cinema.Api.Models;
using Cinema.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace Cinema.Api.Services;

public sealed class AdminService
{
    private readonly CinemaDbContext _db;
    private readonly BookingService _bookings;
    public AdminService(CinemaDbContext db, BookingService bookings) { _db = db; _bookings = bookings; }

    // ---- users ----
    public async Task<object> ListUsersAsync(string? role, bool? active, string? search, int page, int pageSize)
    {
        var q = _db.Users.AsNoTracking().Where(x => x.DeletedAt == null);
        if (role != null) q = q.Where(x => x.Role == role);
        if (active.HasValue) q = q.Where(x => x.Active == active);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var raw = search.Trim();
            var s = "%" + raw.ToLower() + "%";
            q = q.Where(x => EF.Functions.ILike(x.Email, s) || EF.Functions.ILike(x.FullName, s)
                || (x.Phone != null && x.Phone.Contains(raw)));
        }
        var total = await q.LongCountAsync();
        var rows = await q.OrderByDescending(x => x.CreatedAt)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
        var items = rows.Select(AuthService.ToUser).ToList();
        return new { items, meta = new { page, page_size = pageSize, total, total_pages = (int)((total + pageSize - 1) / pageSize) } };
    }

    public sealed record CreateUserRequest(string Email, string Password, string FullName, string Role);

    public async Task<UserResponse> CreateUserAsync(CreateUserRequest r)
    {
        if (r.Role is not ("staff" or "admin"))
            throw ApiException.Validation(new() { ["role"] = "must be staff or admin" });
        if (string.IsNullOrWhiteSpace(r.Password) || r.Password.Length < 6)
            throw ApiException.Validation(new() { ["password"] = "min 6 chars" });
        var now = DateTime.UtcNow;
        _db.Users.Add(new User
        {
            Id = Guid.NewGuid(),
            Email = r.Email.Trim().ToLowerInvariant(),
            Password = BCrypt.Net.BCrypt.HashPassword(r.Password),
            FullName = r.FullName.Trim(),
            Role = r.Role,
            CreatedAt = now,
            UpdatedAt = now,
        });
        try { await _db.SaveChangesAsync(); }
        catch (DbUpdateException ex) when (BookingService.IsUnique(ex))
        {
            throw ApiException.Conflict("email already exists", "email_already_exists");
        }
        return AuthService.ToUser(await _db.Users.SingleAsync(x => x.Email == r.Email.Trim().ToLowerInvariant()));
    }

    public sealed record UpdateUserRequest(string? Role, bool? Active);

    public async Task<UserResponse> UpdateUserAsync(Guid me, Guid id, UpdateUserRequest r)
    {
        var u = await _db.Users.SingleOrDefaultAsync(x => x.Id == id && x.DeletedAt == null)
            ?? throw ApiException.NotFound("user not found", "not_found");
        if (r.Role != null)
        {
            if (r.Role is not ("customer" or "staff" or "admin"))
                throw ApiException.Validation(new() { ["role"] = "unknown role" });
            if (id == me) throw ApiException.Conflict("you can not change your own role", "cannot_demote_self");
            if (u.Role == "admin" && r.Role != "admin")
            {
                var admins = await _db.Users.CountAsync(x => x.Role == "admin" && x.Active && x.DeletedAt == null);
                if (admins <= 1) throw ApiException.Conflict("at least one active admin must remain", "last_admin");
            }
            u.Role = r.Role;
        }
        if (r.Active.HasValue)
        {
            if (id == me && !r.Active.Value)
                throw ApiException.Conflict("you can not lock your own account", "cannot_lock_self");
            if (u.Role == "admin" && !r.Active.Value)
            {
                var admins = await _db.Users.CountAsync(x => x.Role == "admin" && x.Active && x.DeletedAt == null);
                if (admins <= 1) throw ApiException.Conflict("at least one active admin must remain", "last_admin");
            }
            u.Active = r.Active.Value;
        }
        u.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return AuthService.ToUser(u);
    }

    // ---- reports (Go dto/report.go shapes) ----
    public async Task<object> DailyAsync(string? from, string? to)
    {
        var tz = TimeZoneInfo.FindSystemTimeZoneById(
            OperatingSystem.IsWindows() ? "SE Asia Standard Time" : "Asia/Ho_Chi_Minh");
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));
        // Go parseRange: [from, to] local days, default last 7 incl. today.
        var f = from == null ? today.AddDays(-6)
            : DateOnly.TryParseExact(from, "yyyy-MM-dd", out var d1) ? d1
            : throw ApiException.BadRequest("from must follow format YYYY-MM-DD", "validation");
        var t = to == null ? today
            : DateOnly.TryParseExact(to, "yyyy-MM-dd", out var d2) ? d2
            : throw ApiException.BadRequest("to must follow format YYYY-MM-DD", "validation");
        if (f > t) throw ApiException.BadRequest("from must not be after to", "validation");
        if (t.DayNumber - f.DayNumber > 366) throw ApiException.BadRequest("the range can not exceed 366 days", "range_too_wide");
        var rows = await _db.DailyAggregates.AsNoTracking()
            .Where(x => x.ReportDate >= f && x.ReportDate <= t)
            .OrderBy(x => x.ReportDate).ToListAsync();
        return new
        {
            from = f.ToString("yyyy-MM-dd"),
            to = t.ToString("yyyy-MM-dd"),
            total_revenue = rows.Sum(x => x.TotalRevenue),
            tickets_sold = rows.Sum(x => x.TicketsSold),
            days = rows.Select(x => new
            {
                report_date = x.ReportDate.ToString("yyyy-MM-dd"),
                total_revenue = x.TotalRevenue,
                tickets_sold = x.TicketsSold,
                seats_sold = x.SeatsSold,
                capacity = x.Capacity,
                occupancy_rate = x.OccupancyRate,
                breakdown = ParseJson(x.Breakdown),
                updated_at = x.UpdatedAt,
            }).ToList(),
        };
    }

    private static object ParseJson(string raw)
    {
        try
        {
            return System.Text.Json.JsonSerializer.Deserialize<object>(string.IsNullOrEmpty(raw) ? "{}" : raw)
                ?? new { };
        }
        catch { return new { }; }
    }

    public async Task<object> BreakdownAsync(string? from, string? to)
    {
        var tz = TimeZoneInfo.FindSystemTimeZoneById(
            OperatingSystem.IsWindows() ? "SE Asia Standard Time" : "Asia/Ho_Chi_Minh");
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));
        // Go parseRange: [from, to] local days, default last 7 incl. today; query is [from 00:00, to+1 00:00).
        var fDay = from == null ? today.AddDays(-6)
            : DateOnly.TryParseExact(from, "yyyy-MM-dd", out var d1) ? d1
            : throw ApiException.BadRequest("from must follow format YYYY-MM-DD", "validation");
        var tDay = to == null ? today
            : DateOnly.TryParseExact(to, "yyyy-MM-dd", out var d2) ? d2
            : throw ApiException.BadRequest("to must follow format YYYY-MM-DD", "validation");
        if (fDay > tDay) throw ApiException.BadRequest("from must not be after to", "validation");
        if (tDay.DayNumber - fDay.DayNumber > 366) throw ApiException.BadRequest("the range can not exceed 366 days", "range_too_wide");
        var f = TimeZoneInfo.ConvertTimeToUtc(fDay.ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified), tz);
        var t = TimeZoneInfo.ConvertTimeToUtc(tDay.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified), tz);
        // Go report repository sums bookings.total_amount (undiscounted subtotal) - revenue is gross.
        var orders = await _db.Bookings.AsNoTracking()
            .Where(x => x.Status == "confirmed" && x.PaidAt >= f && x.PaidAt < t).ToListAsync();
        var oids = orders.Select(x => x.Id).ToList();
        var ticketRows = await _db.Tickets.AsNoTracking()
            .Where(x => oids.Contains(x.BookingId)).Select(x => x.BookingId).ToListAsync();
        var ticketsByBooking = ticketRows.GroupBy(x => x).ToDictionary(g => g.Key, g => g.Count());
        int Tickets(Booking b) => ticketsByBooking.TryGetValue(b.Id, out var n) ? n : 0;

        var days = orders.GroupBy(x => TimeZoneInfo.ConvertTimeFromUtc(
                x.PaidAt!.Value.Kind == DateTimeKind.Utc ? x.PaidAt.Value : x.PaidAt.Value.ToUniversalTime(), tz)
                .ToString("yyyy-MM-dd"))
            .OrderBy(g => g.Key)
            .Select(g => new
            {
                date = g.Key,
                revenue = g.Sum(x => x.TotalAmount),
                tickets = g.Sum(Tickets),
            }).ToList();

        // Go: GROUP BY m.id / h.id across showtimes, ORDER BY revenue DESC LIMIT 10.
        var showIds = orders.Select(x => x.ShowtimeId).Distinct().ToList();
        var shows = await _db.Showtimes.AsNoTracking().Where(x => showIds.Contains(x.Id))
            .Select(x => new ShowAgg(x.Id, x.MovieId, x.HallId)).ToListAsync();
        var showMap = shows.ToDictionary(x => x.Id);
        var movieIds = shows.Select(x => x.MovieId).Distinct().ToList();
        var hallIds = shows.Select(x => x.HallId).Distinct().ToList();
        var titles = await _db.Movies.AsNoTracking().Where(x => movieIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => x.Title);
        var hallNames = await _db.Halls.AsNoTracking().Where(x => hallIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => x.Name);

        var movies = orders.Where(o => showMap.ContainsKey(o.ShowtimeId))
            .GroupBy(o => showMap[o.ShowtimeId].MovieId)
            .Select(g => new
            {
                movie_id = g.Key,
                title = titles.TryGetValue(g.Key, out var ttl) ? ttl : "",
                revenue = g.Sum(x => x.TotalAmount),
                tickets = g.Sum(Tickets),
            })
            .OrderByDescending(x => x.revenue).Take(10).ToList();

        var halls = orders.Where(o => showMap.ContainsKey(o.ShowtimeId))
            .GroupBy(o => showMap[o.ShowtimeId].HallId)
            .Select(g => new
            {
                hall_id = g.Key,
                name = hallNames.TryGetValue(g.Key, out var nm) ? nm : "",
                revenue = g.Sum(x => x.TotalAmount),
                tickets = g.Sum(Tickets),
            })
            .OrderByDescending(x => x.revenue).Take(10).ToList();

        // Go: payments where status='paid' and paid_at in range, grouped by provider, ordered by revenue.
        var providers = (await _db.Payments.AsNoTracking()
            .Where(x => x.Status == "paid" && x.PaidAt >= f && x.PaidAt < t)
            .GroupBy(x => x.Provider)
            .Select(g => new { provider = g.Key, revenue = g.Sum(x => x.PaidAmount ?? x.Amount), count = g.Count() })
            .ToListAsync())
            .OrderByDescending(x => x.revenue).ToList();
        return new
        {
            from = fDay.ToString("yyyy-MM-dd"),
            to = tDay.ToString("yyyy-MM-dd"),
            total_revenue = orders.Sum(x => x.TotalAmount),
            tickets_sold = ticketRows.Count,
            days,
            movies,
            halls,
            providers,
        };
    }

    private sealed record ShowAgg(Guid Id, Guid MovieId, Guid HallId);

    public async Task<object> OverviewAsync()
    {
        var tz = TimeZoneInfo.FindSystemTimeZoneById(
            OperatingSystem.IsWindows() ? "SE Asia Standard Time" : "Asia/Ho_Chi_Minh");
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));
        var dayFrom = TimeZoneInfo.ConvertTimeToUtc(today.ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified), tz);
        var dayTo = dayFrom.AddDays(1);
        // Today is computed live (Go liveDayAggregateSQL) - no closeDay run needed.
        var paidToday = await _db.Bookings.AsNoTracking()
            .Where(x => x.Status == "confirmed" && x.PaidAt >= dayFrom && x.PaidAt < dayTo).ToListAsync();
        var paidIds = paidToday.Select(x => x.Id).ToList();
        var ticketsToday = await _db.Tickets.AsNoTracking().CountAsync(x => paidIds.Contains(x.BookingId));
        var todayShows = await _db.Showtimes.AsNoTracking()
            .Where(x => x.DeletedAt == null && x.StartAt >= dayFrom && x.StartAt < dayTo).ToListAsync();
        var todayShowIds = todayShows.Select(x => x.Id).ToList();
        var ssToday = await _db.ShowtimeSeats.AsNoTracking()
            .Where(x => todayShowIds.Contains(x.ShowtimeId)).ToListAsync();
        var ssSeatIds = ssToday.Select(x => x.SeatId).Distinct().ToList();
        var ssSeatMap = await _db.Seats.AsNoTracking()
            .Where(x => ssSeatIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id);
        var capToday = ssToday.Count(x => ssSeatMap.TryGetValue(x.SeatId, out var p) && !p.IsGap);
        var soldToday = ssToday.Count(x => x.Status == "sold");
        var todayObj = new
        {
            report_date = today.ToString("yyyy-MM-dd"),
            total_revenue = paidToday.Sum(x => x.TotalAmount),
            tickets_sold = ticketsToday,
            seats_sold = soldToday,
            capacity = capToday,
            occupancy_rate = capToday == 0 ? 0m : Math.Round((decimal)soldToday * 100 / capToday, 2),
            breakdown = (object)new { },
            updated_at = DateTime.UtcNow,
        };
        var last7 = await _db.DailyAggregates.AsNoTracking()
            .Where(x => x.ReportDate > today.AddDays(-7) && x.ReportDate <= today)
            .OrderBy(x => x.ReportDate).ToListAsync();
        object Day(DailyAggregate x) => new
        {
            report_date = x.ReportDate.ToString("yyyy-MM-dd"),
            total_revenue = x.TotalRevenue,
            tickets_sold = x.TicketsSold,
            seats_sold = x.SeatsSold,
            capacity = x.Capacity,
            occupancy_rate = x.OccupancyRate,
            breakdown = ParseJson(x.Breakdown),
            updated_at = x.UpdatedAt,
        };
        var now = DateTime.UtcNow;
        // Go ShowtimeBoard: no status filter, held only when the hold has not expired, whole remaining day.
        var upcoming = await _db.Showtimes.AsNoTracking()
            .Where(x => x.DeletedAt == null && x.StartAt >= now && x.StartAt < dayTo)
            .OrderBy(x => x.StartAt).ToListAsync();
        var ups = new List<object>();
        foreach (var s in upcoming)
        {
            var m = await _db.Movies.AsNoTracking().SingleAsync(x => x.Id == s.MovieId);
            var h = await _db.Halls.AsNoTracking().SingleAsync(x => x.Id == s.HallId);
            var seats = await _db.ShowtimeSeats.AsNoTracking().Where(x => x.ShowtimeId == s.Id).ToListAsync();
            var phys = await _db.Seats.AsNoTracking().Where(x => x.HallId == s.HallId)
                .ToDictionaryAsync(x => x.Id);
            var cap = seats.Count(x => phys.TryGetValue(x.SeatId, out var p) && !p.IsGap);
            var held = seats.Count(x => x.Status == "held" && x.HeldUntil > now);
            var sold = seats.Count(x => x.Status == "sold");
            var checkedIn = await _db.Tickets.AsNoTracking()
                .Join(_db.Bookings.AsNoTracking(), t => t.BookingId, b => b.Id, (t, b) => new { t, b })
                .CountAsync(x => x.b.ShowtimeId == s.Id && x.b.Status == "confirmed" && x.t.Status == "redeemed");
            ups.Add(new
            {
                id = s.Id,
                movie_title = m.Title,
                hall_name = h.Name,
                start_at = s.StartAt,
                end_at = s.EndAt,
                status = s.Status,
                capacity = cap,
                held,
                sold,
                available = cap - held - sold,
                checked_in = checkedIn,
            });
        }
        var stuck = await _db.Payments.AsNoTracking()
            .Where(x => x.Status == "refund_pending" && x.RefundAttempts >= 3)
            .Select(x => new
            {
                payment_id = x.Id,
                booking_id = x.BookingId,
                attempts = x.RefundAttempts,
                amount = x.PaidAmount ?? x.Amount,
                last_error = x.LastError,
            }).Take(20).ToListAsync();
        var failed = await _db.BatchJobs.AsNoTracking()
            .Where(x => x.Status == "failed").OrderByDescending(x => x.StartedAt).Take(20)
            .Select(x => new
            {
                id = x.Id,
                job_name = x.JobName,
                error_message = x.ErrorMessage,
                started_at = x.StartedAt,
            }).ToListAsync();
        var emails = await _db.Bookings.AsNoTracking()
            .Where(x => x.Status == "confirmed" && x.EmailSentAt == null && x.EmailAttempts >= 6)
            .Select(x => new { booking_id = x.Id, attempts = x.EmailAttempts, created_at = x.CreatedAt })
            .Take(20).ToListAsync();
        return new
        {
            today = todayObj,
            last_7_days = last7.Select(Day).ToList(),
            upcoming_showtimes = ups,
            alerts = new
            {
                stuck_refunds = stuck,
                failed_jobs = failed,
                given_up_emails = emails,
            },
        };
    }

    public async Task<object> StatsAsync()
        => new
        {
            movies = await _db.Movies.LongCountAsync(x => x.DeletedAt == null),
            showtimes = await _db.Showtimes.LongCountAsync(x => x.DeletedAt == null),
            bookings = await _db.Bookings.LongCountAsync(x => x.Status == "confirmed"),
            users = await _db.Users.LongCountAsync(x => x.DeletedAt == null),
        };

    // ---- batch ----
    public async Task<(List<BatchJob> Items, long Total)> BatchListAsync(
        string? search, int page, int pageSize)
    {
        // Go batch repo List: started_at DESC, ?search= on job_name.
        var q = _db.BatchJobs.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLower();
            q = q.Where(x => x.JobName.ToLower().Contains(s));
        }
        var total = await q.LongCountAsync();
        var items = await q.OrderByDescending(x => x.StartedAt)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
        return (items, total);
    }

    // ---- audit ----
    public async Task<object> AuditListAsync(string? action, string? resourceType, string? resourceId,
        string? bookingId, string? actorId, string? outcome, string? from, string? to, int page, int pageSize)
    {
        var q = _db.AuditLogs.AsNoTracking().OrderByDescending(x => x.CreatedAt).AsQueryable();
        if (action != null) q = q.Where(x => x.Action == action);
        if (resourceType != null) q = q.Where(x => x.ResourceType == resourceType);
        if (resourceId != null) q = q.Where(x => x.ResourceId == resourceId);
        // Go compares uuid columns to the raw string: a non-uuid filter matches nothing.
        if (bookingId != null)
            q = Guid.TryParse(bookingId, out var bg) ? q.Where(x => x.BookingId == bg) : q.Where(x => false);
        if (actorId != null)
            q = Guid.TryParse(actorId, out var ag) ? q.Where(x => x.ActorId == ag) : q.Where(x => false);
        if (outcome != null) q = q.Where(x => x.Outcome == outcome);
        // Go time.Parse: UTC-midnight bounds.
        if (!string.IsNullOrEmpty(from))
        {
            if (!DateOnly.TryParseExact(from, "yyyy-MM-dd", out var d1))
                throw ApiException.BadRequest("date must follow format YYYY-MM-DD", "validation");
            var f = d1.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
            q = q.Where(x => x.CreatedAt >= f);
        }
        if (!string.IsNullOrEmpty(to))
        {
            if (!DateOnly.TryParseExact(to, "yyyy-MM-dd", out var d2))
                throw ApiException.BadRequest("date must follow format YYYY-MM-DD", "validation");
            var t = d2.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
            q = q.Where(x => x.CreatedAt < t);
        }
        var total = await q.LongCountAsync();
        var items = await q.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
        return new { items, meta = new { page, page_size = pageSize, total, total_pages = (int)((total + pageSize - 1) / pageSize) } };
    }

    // ---- admin orders ----
    // Go orderListBounds: date wins; [start, end) as absolute instants in cinema local days.
    public async Task<object> OrderListAsync(string? status, string? paymentStatus, string? soldVia,
        Guid? showtimeId, Guid? movieId, Guid? userId, string? search, string? date, string? from, string? to,
        string? sort, string? order, int page, int pageSize)
    {
        var tz = TimeZoneInfo.FindSystemTimeZoneById(
            OperatingSystem.IsWindows() ? "SE Asia Standard Time" : "Asia/Ho_Chi_Minh");
        DateTime ParseDay(string value)
        {
            if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", out var d))
                throw ApiException.BadRequest("date must follow format YYYY-MM-DD", "validation");
            return TimeZoneInfo.ConvertTimeToUtc(d.ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified), tz);
        }
        DateTime? rangeFrom = null, rangeTo = null;
        if (!string.IsNullOrEmpty(date))
        {
            var day = ParseDay(date);
            rangeFrom = day;
            rangeTo = day.AddDays(1);
        }
        else
        {
            if (!string.IsNullOrEmpty(from)) rangeFrom = ParseDay(from);
            if (!string.IsNullOrEmpty(to)) rangeTo = ParseDay(to).AddDays(1);
            if (rangeFrom.HasValue && rangeTo.HasValue && rangeTo.Value <= rangeFrom.Value)
                throw ApiException.BadRequest("to must not be earlier than from", "validation");
        }

        var q = _db.Bookings.AsNoTracking().AsQueryable();
        if (status != null) q = q.Where(x => x.Status == status);
        if (soldVia != null) q = q.Where(x => x.SoldVia == soldVia);
        if (showtimeId.HasValue) q = q.Where(x => x.ShowtimeId == showtimeId);
        if (userId.HasValue) q = q.Where(x => x.UserId == userId);
        if (movieId.HasValue)
        {
            var stIds = _db.Showtimes.AsNoTracking().Where(s => s.MovieId == movieId).Select(s => s.Id);
            q = q.Where(x => stIds.Contains(x.ShowtimeId));
        }
        if (paymentStatus != null)
        {
            var pIds = _db.Payments.AsNoTracking().Where(p => p.Status == paymentStatus).Select(p => p.Id);
            q = q.Where(x => x.PaymentId != null && pIds.Contains(x.PaymentId.Value));
        }
        if (rangeFrom.HasValue) q = q.Where(x => x.CreatedAt >= rangeFrom.Value);
        if (rangeTo.HasValue) q = q.Where(x => x.CreatedAt < rangeTo.Value);
        if (!string.IsNullOrWhiteSpace(search))
        {
            // Go AdminOrderList: id equality OR lowered LIKE on email/name/till-note/title, raw LIKE on phone.
            var raw = search.Trim();
            var lowered = raw.ToLowerInvariant();
            Guid? idHit = Guid.TryParse(lowered, out var idg) ? idg : null;
            var titleStIds = _db.Showtimes.AsNoTracking()
                .Where(s => _db.Movies.Any(m => m.Id == s.MovieId && m.Title.ToLower().Contains(lowered)))
                .Select(s => s.Id);
            q = q.Where(x =>
                (idHit != null && x.Id == idHit.Value)
                || _db.Users.Any(u => u.Id == x.UserId && (u.Email.ToLower().Contains(lowered) || u.FullName.ToLower().Contains(lowered)))
                || (x.CustomerName != null && x.CustomerName.ToLower().Contains(lowered))
                || (x.CustomerPhone != null && x.CustomerPhone.Contains(raw))
                || titleStIds.Contains(x.ShowtimeId));
        }

        // Go adminOrderOrder: whitelisted sort key (created_at default), asc/desc, then id tiebreak.
        var asc = string.Equals(order, "asc", StringComparison.OrdinalIgnoreCase);
        IOrderedQueryable<Booking> ordered = sort switch
        {
            "paid_at" => asc ? q.OrderBy(x => x.PaidAt) : q.OrderByDescending(x => x.PaidAt),
            "total_amount" => asc ? q.OrderBy(x => x.TotalAmount) : q.OrderByDescending(x => x.TotalAmount),
            "start_at" => asc
                ? q.OrderBy(x => _db.Showtimes.Where(s => s.Id == x.ShowtimeId).Select(s => s.StartAt).First())
                : q.OrderByDescending(x => _db.Showtimes.Where(s => s.Id == x.ShowtimeId).Select(s => s.StartAt).First()),
            _ => asc ? q.OrderBy(x => x.CreatedAt) : q.OrderByDescending(x => x.CreatedAt),
        };
        var total = await q.LongCountAsync();
        var items = await ordered.ThenBy(x => x.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
        var out_ = new List<AdminOrderItem>();
        foreach (var b in items)
        {
            var st = await _bookings.ToStatusAsync(b);
            var seats = await _db.BookingSeats.CountAsync(x => x.BookingId == b.Id);
            object? cust = null;
            if (b.UserId != null)
            {
                var u = await _db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == b.UserId);
                if (u != null) cust = new { user_id = u.Id, email = u.Email, full_name = u.FullName, phone = u.Phone };
            }
            else if (!string.IsNullOrEmpty(b.CustomerName) || !string.IsNullOrEmpty(b.CustomerPhone))
            {
                // Counter sale: no account, only till note. No note at all -> null (walkInNoContact).
                cust = new { full_name = b.CustomerName, phone = b.CustomerPhone };
            }
            out_.Add(new AdminOrderItem(st.Id, st.ShowtimeId, st.Status, st.StatusReason,
                st.TotalAmount, st.DiscountAmount, st.PayableAmount, st.CreatedAt,
                st.ExpiresAt, st.PaidAt, st.CollectedAt, st.Payment, st.Showtime,
                b.SoldVia, seats, cust));
        }
        return new { items = out_, meta = new { page, page_size = pageSize, total, total_pages = (int)((total + pageSize - 1) / pageSize) } };
    }
}
