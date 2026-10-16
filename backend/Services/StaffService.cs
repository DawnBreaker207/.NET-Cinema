using Cinema.Api.Common;
using Cinema.Api.Data;
using Cinema.Api.Dtos;
using Cinema.Api.Models;
using Cinema.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace Cinema.Api.Services;

// Staff console reads (no money figures) + counter actions.
public sealed class StaffService
{
    private readonly CinemaDbContext _db;
    private readonly BookingService _bookings;
    public StaffService(CinemaDbContext db, BookingService bookings) { _db = db; _bookings = bookings; }

    private static (DateTime From, DateTime To, string Day) VnDay(string? date)
    {
        var tz = TimeZoneInfo.FindSystemTimeZoneById(
            OperatingSystem.IsWindows() ? "SE Asia Standard Time" : "Asia/Ho_Chi_Minh");
        var day = date != null && DateOnly.TryParseExact(date, "yyyy-MM-dd", out var d)
            ? d : DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));
        var from = TimeZoneInfo.ConvertTimeToUtc(day.ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified), tz);
        return (from, from.AddDays(1), day.ToString("yyyy-MM-dd"));
    }

    public async Task<object> DashboardAsync(string? date)
    {
        var (from, to, dayStr) = VnDay(date);
        var sts = await _db.Showtimes.AsNoTracking()
            .Where(x => x.DeletedAt == null && x.StartAt >= from && x.StartAt < to)
            .OrderBy(x => x.StartAt).ToListAsync();
        var out_ = new List<object>();
        foreach (var s in sts) out_.Add(await StaffShowtimeAsync(s));
        return new { date = dayStr, showtimes = out_ };
    }

    private async Task<object> StaffShowtimeAsync(Showtime s)
    {
        var m = await _db.Movies.AsNoTracking().SingleAsync(x => x.Id == s.MovieId);
        var h = await _db.Halls.AsNoTracking().SingleAsync(x => x.Id == s.HallId);
        var seats = await _db.ShowtimeSeats.AsNoTracking().Where(x => x.ShowtimeId == s.Id).ToListAsync();
        var phys = await _db.Seats.AsNoTracking().Where(x => x.HallId == s.HallId)
            .ToDictionaryAsync(x => x.Id);
        var capacity = seats.Count(x => phys.TryGetValue(x.SeatId, out var p) && !p.IsGap);
        var held = seats.Count(x => x.Status == "held");
        var sold = seats.Count(x => x.Status == "sold");
        var stIds = seats.Select(x => x.Id).ToList();
        var checkedIn = await _db.Tickets.AsNoTracking()
            .CountAsync(t => stIds.Contains(t.ShowtimeSeatId) && t.Status == "redeemed");
        return new
        {
            id = s.Id,
            movie_title = m.Title,
            hall_name = h.Name,
            start_at = s.StartAt,
            end_at = s.EndAt,
            status = s.Status,
            capacity,
            held,
            sold,
            available = capacity - held - sold,
            checked_in = checkedIn,
        };
    }

    public async Task<object> OverviewAsync(string? date)
    {
        var (from, to, dayStr) = VnDay(date);
        var board = (dynamic)await DashboardAsync(date);
        var counterOrders = await _db.Bookings.AsNoTracking()
            .Where(x => x.Status != "pending" && x.SoldVia == "counter" && x.PaidAt >= from && x.PaidAt < to)
            .ToListAsync();
        var combos = await _db.ComboOrders.AsNoTracking()
            .Where(x => x.CreatedAt >= from && x.CreatedAt < to).ToListAsync();
        // Go: awaiting = SUM(Sold - CheckedIn) over the day's board showtimes.
        var dayShowIds = await _db.Showtimes.AsNoTracking()
            .Where(x => x.DeletedAt == null && x.StartAt >= from && x.StartAt < to)
            .Select(x => x.Id).ToListAsync();
        var soldSeats = await _db.ShowtimeSeats.AsNoTracking()
            .Where(x => dayShowIds.Contains(x.ShowtimeId) && x.Status == "sold").CountAsync();
        var redeemed = await _db.Tickets.AsNoTracking()
            .Join(_db.Bookings.AsNoTracking(), t => t.BookingId, b => b.Id, (t, b) => new { t, b })
            .Where(x => x.b.Status == "confirmed" && dayShowIds.Contains(x.b.ShowtimeId)
                && x.t.Status == "redeemed")
            .CountAsync();
        var awaiting = soldSeats - redeemed;
        return new
        {
            date = dayStr,
            showtimes = board.showtimes,
            counter_sales_count = (long)counterOrders.Count,
            counter_sales_total = counterOrders.Sum(x => x.TotalAmount),
            combo_sales_count = (long)combos.Count,
            combo_sales_total = combos.Sum(x => x.Total),
            awaiting_checkin = awaiting,
        };
    }

    public async Task<object> BoxOfficeDayAsync(string? date)
    {
        var (from, to, dayStr) = VnDay(date);
        var counterOrders = await _db.Bookings.AsNoTracking()
            .Where(x => x.Status != "pending" && x.SoldVia == "counter" && x.PaidAt >= from && x.PaidAt < to)
            .ToListAsync();
        var combos = await _db.ComboOrders.AsNoTracking()
            .Where(x => x.CreatedAt >= from && x.CreatedAt < to).ToListAsync();
        return new
        {
            date = dayStr,
            count = (long)counterOrders.Count,
            total = counterOrders.Sum(x => x.TotalAmount),
            combo_count = (long)combos.Count,
            combo_total = combos.Sum(x => x.Total),
        };
    }

    // Go CounterSalesByMovie: counter-paid bookings of the day grouped by movie, revenue = SUM(total_amount).
    public async Task<object> CounterMoviesAsync(string? date)
    {
        var (from, to, _) = VnDay(date);
        var orders = await _db.Bookings.AsNoTracking()
            .Where(x => x.SoldVia == "counter" && x.Status != "pending"
                && x.PaidAt >= from && x.PaidAt < to).ToListAsync();
        var oids = orders.Select(x => x.Id).ToList();
        var ticketRows = await _db.Tickets.AsNoTracking()
            .Where(x => oids.Contains(x.BookingId)).Select(x => x.BookingId).ToListAsync();
        var ticketsByBooking = ticketRows.GroupBy(x => x).ToDictionary(g => g.Key, g => g.Count());
        var showIds = orders.Select(x => x.ShowtimeId).Distinct().ToList();
        var shows = await _db.Showtimes.AsNoTracking().Where(x => showIds.Contains(x.Id))
            .Select(x => new { x.Id, x.MovieId }).ToListAsync();
        var showMap = shows.ToDictionary(x => x.Id, x => x.MovieId);
        var movieIds = shows.Select(x => x.MovieId).Distinct().ToList();
        var titles = await _db.Movies.AsNoTracking().Where(x => movieIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => x.Title);
        return orders.Where(o => showMap.ContainsKey(o.ShowtimeId))
            .GroupBy(o => showMap[o.ShowtimeId])
            .Select(g => new
            {
                movie_id = g.Key,
                title = titles.TryGetValue(g.Key, out var ttl) ? ttl : "",
                tickets = (long)g.Sum(x => ticketsByBooking.TryGetValue(x.Id, out var cnt) ? cnt : 0),
                revenue = g.Sum(x => x.TotalAmount),
            })
            .OrderByDescending(x => x.revenue).ToList();
    }

    public async Task<OrderDetailResponse> CounterSellAsync(Guid sellerId, CounterSellRequest r)
        => await _bookings.CounterSellAsync(sellerId, r);

    public async Task<OrderDetailResponse> OrderDetailAsync(Guid id)
        => await _bookings.DetailAsync(Guid.Empty, id, staff: true);

    public async Task CollectAsync(Guid id)
    {
        var n = await _db.Bookings.Where(x => x.Id == id && x.Status == "confirmed" && x.CollectedAt == null)
            .ExecuteUpdateAsync(x => x.SetProperty(b => b.CollectedAt, DateTime.UtcNow));
        if (n == 0) throw ApiException.NotFound("order not found", "not_found");
    }

    public async Task<object> OrderByTicketAsync(string code)
    {
        var t = await _db.Tickets.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Code == code || x.Id.ToString() == code)
            ?? throw ApiException.NotFound("ticket not found", "not_found");
        return await _bookings.DetailAsync(Guid.Empty, t.BookingId, staff: true);
    }

    public async Task<object> ShowTicketsAsync(Guid showtimeId, string? status)
    {
        var q = _db.Tickets.AsNoTracking()
            .Join(_db.Bookings.AsNoTracking(), t => t.BookingId, b => b.Id, (t, b) => new { t, b })
            .Where(x => x.b.ShowtimeId == showtimeId && x.b.Status == "confirmed");
        if (status != null) q = q.Where(x => x.t.Status == status);
        var rows = await q.OrderBy(x => x.t.CreatedAt).ToListAsync();
        var out_ = new List<object>();
        foreach (var x in rows)
        {
            var ss = await _db.ShowtimeSeats.AsNoTracking().SingleAsync(s => s.Id == x.t.ShowtimeSeatId);
            var seat = await _db.Seats.AsNoTracking().SingleAsync(s => s.Id == ss.SeatId);
            out_.Add(new
            {
                ticket_id = x.t.Id,
                code = x.t.Code,
                status = x.t.Status,
                seat_label = seat.RowLabel + seat.ColNumber,
                price = x.t.Price,
            });
        }
        return out_;
    }

    public async Task<object> SearchCustomersAsync(string? search, int page, int pageSize)
    {
        var q = _db.Users.AsNoTracking().Where(x => x.Role == "customer" && x.DeletedAt == null);
        if (!string.IsNullOrWhiteSpace(search))
        {
            // Go user search: lowered LIKE on email/name, raw LIKE on phone.
            var raw = search.Trim();
            var s = "%" + raw.ToLower() + "%";
            q = q.Where(x => EF.Functions.ILike(x.Email, s) || EF.Functions.ILike(x.FullName, s)
                || (x.Phone != null && x.Phone.Contains(raw)));
        }
        var total = await q.LongCountAsync();
        var items = await q.OrderByDescending(x => x.CreatedAt)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new { id = x.Id, email = x.Email, full_name = x.FullName, phone = x.Phone, active = x.Active })
            .ToListAsync();
        return new { items, meta = new { page, page_size = pageSize, total, total_pages = (int)((total + pageSize - 1) / pageSize) } };
    }

    // Go: full UserResponse; 404 unless the id is a customer account.
    public async Task<object> CustomerProfileAsync(Guid id)
    {
        var u = await _db.Users.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == id && x.Role == "customer" && x.DeletedAt == null)
            ?? throw ApiException.NotFound("user not found", "user_not_found");
        return AuthService.ToUser(u);
    }

    public async Task<object> CustomerOrdersAsync(Guid id, int page, int pageSize)
    {
        if (!await _db.Users.AnyAsync(x => x.Id == id && x.Role == "customer" && x.DeletedAt == null))
            throw ApiException.NotFound("user not found", "user_not_found");
        var q = _db.Bookings.AsNoTracking().Where(x => x.UserId == id).OrderByDescending(x => x.CreatedAt);
        var total = await q.LongCountAsync();
        var items = await q.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
        var list = new List<OrderStatusResponse>();
        foreach (var b in items) list.Add(await _bookings.ToStatusAsync(b));
        return new { items = list, meta = new { page, page_size = pageSize, total, total_pages = (int)((total + pageSize - 1) / pageSize) } };
    }
}
