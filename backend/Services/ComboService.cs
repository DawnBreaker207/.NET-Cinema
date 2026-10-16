using Cinema.Api.Common;
using Cinema.Api.Data;
using Cinema.Api.Dtos;
using Cinema.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Cinema.Api.Services;

// Concessions (combos) + combo orders, online + counter.
public sealed class ComboService
{
    private readonly CinemaDbContext _db;
    public ComboService(CinemaDbContext db) => _db = db;

    public static ComboOrderResponse ToOrder(ComboOrder o, List<ComboOrderItem> items) => new(
        o.Id, o.BookingId, o.Status, o.Total, o.SoldChannel,
        items.Select(i => new ComboOrderItemResponse(i.ComboId, i.ComboName, i.Quantity, i.UnitPrice)).ToList(),
        o.CreatedAt);

    public async Task<List<ComboResponse>> ListAsync(bool onlyActive)
    {
        var q = _db.ConcessionItems.AsNoTracking().Where(x => x.DeletedAt == null);
        if (onlyActive) q = q.Where(x => x.Active);
        return await q.OrderBy(x => x.Name)
            .Select(x => new ComboResponse(x.Id, x.Name, x.Description, x.Price, x.ImageUrl, x.Active, x.CreatedAt, x.UpdatedAt))
            .ToListAsync();
    }

    // Go: GET /admin/concessions is paged (response.List), ?search= code/description, ?active=.
    public async Task<(List<ComboResponse> Items, long Total)> AdminListPagedAsync(
        string? search, bool? active, int page, int pageSize)
    {
        var q = _db.ConcessionItems.AsNoTracking().Where(x => x.DeletedAt == null);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLower();
            q = q.Where(x => x.Name.ToLower().Contains(s) || (x.Description != null && x.Description.ToLower().Contains(s)));
        }
        if (active != null) q = q.Where(x => x.Active == active);
        var total = await q.LongCountAsync();
        var rows = await q.OrderBy(x => x.Name).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new ComboResponse(x.Id, x.Name, x.Description, x.Price, x.ImageUrl, x.Active, x.CreatedAt, x.UpdatedAt))
            .ToListAsync();
        return (rows, total);
    }

    public async Task<ComboResponse> GetAsync(Guid id)
    {
        var x = await _db.ConcessionItems.AsNoTracking()
            .SingleOrDefaultAsync(c => c.Id == id && c.DeletedAt == null)
            ?? throw ApiException.NotFound("combo not found", "not_found");
        return new ComboResponse(x.Id, x.Name, x.Description, x.Price, x.ImageUrl, x.Active, x.CreatedAt, x.UpdatedAt);
    }

    public async Task<ComboResponse> CreateAsync(ComboRequest r)
    {
        Validate(r);
        var now = DateTime.UtcNow;
        var c = new ConcessionItem
        {
            Id = Guid.NewGuid(),
            Name = r.Name.Trim(),
            Description = r.Description,
            Price = r.Price,
            ImageUrl = r.ImageUrl,
            Active = r.Active ?? true,
            CreatedAt = now,
            UpdatedAt = now,
        };
        _db.ConcessionItems.Add(c);
        await _db.SaveChangesAsync();
        return await GetAsync(c.Id);
    }

    public async Task<ComboResponse> UpdateAsync(Guid id, ComboRequest r)
    {
        Validate(r);
        var c = await _db.ConcessionItems.SingleOrDefaultAsync(x => x.Id == id && x.DeletedAt == null)
            ?? throw ApiException.NotFound("combo not found", "not_found");
        c.Name = r.Name.Trim(); c.Description = r.Description; c.Price = r.Price;
        c.ImageUrl = r.ImageUrl; c.Active = r.Active ?? c.Active; c.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return await GetAsync(id);
    }

    public async Task DeleteAsync(Guid id)
    {
        var c = await _db.ConcessionItems.SingleOrDefaultAsync(x => x.Id == id && x.DeletedAt == null)
            ?? throw ApiException.NotFound("combo not found", "not_found");
        c.DeletedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
    }

    public async Task<ComboOrderResponse> CreateOrderAsync(Guid? uid, ComboOrderRequest r)
    {
        if (r.Items.Count == 0) throw ApiException.Validation(new() { ["items"] = "required" });
        var now = DateTime.UtcNow;
        var ids = r.Items.Select(i => i.ComboId).ToList();
        var combos = await _db.ConcessionItems
            .Where(x => ids.Contains(x.Id) && x.DeletedAt == null && x.Active)
            .ToDictionaryAsync(x => x.Id);
        var o = new ComboOrder
        {
            Id = Guid.NewGuid(),
            UserId = uid,
            BookingId = r.BookingId,
            SoldChannel = uid == null ? "counter" : "online",
            CreatedAt = now,
            UpdatedAt = now,
        };
        _db.ComboOrders.Add(o);
        await _db.SaveChangesAsync();
        foreach (var i in r.Items)
        {
            if (!combos.TryGetValue(i.ComboId, out var c))
                throw ApiException.BadRequest("unknown or inactive combo", "combo_not_found");
            if (i.Quantity < 1) throw ApiException.Validation(new() { ["quantity"] = "must be >= 1" });
            o.Total += c.Price * i.Quantity;
            _db.ComboOrderItems.Add(new ComboOrderItem
            {
                Id = Guid.NewGuid(),
                ComboOrderId = o.Id,
                ComboId = c.Id,
                ComboName = c.Name,
                Quantity = i.Quantity,
                UnitPrice = c.Price,
                CreatedAt = now,
            });
        }
        await _db.SaveChangesAsync();
        var items = await _db.ComboOrderItems.Where(x => x.ComboOrderId == o.Id).ToListAsync();
        return ToOrder(o, items);
    }

    public async Task<(IReadOnlyList<ComboOrderResponse> Items, long Total)> MyOrdersAsync(
        Guid uid, int page, int pageSize)
    {
        var q = _db.ComboOrders.AsNoTracking().Where(x => x.UserId == uid)
            .OrderByDescending(x => x.CreatedAt);
        var total = await q.LongCountAsync();
        var orders = await q.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
        var out_ = new List<ComboOrderResponse>();
        foreach (var o in orders)
            out_.Add(ToOrder(o, await _db.ComboOrderItems.AsNoTracking()
                .Where(x => x.ComboOrderId == o.Id).ToListAsync()));
        return (out_, total);
    }

    public async Task<ComboOrderResponse> CounterSellAsync(CounterComboRequest r)
    {
        if (r.PayMethod != null && r.PayMethod is not ("cash" or "pos"))
            throw ApiException.Validation(new() { ["pay_method"] = "must be cash or pos" });
        var o = await CreateOrderAsync(null, new ComboOrderRequest(null, r.Items));
        var e = await _db.ComboOrders.SingleAsync(x => x.Id == o.Id);
        e.PayMethod = r.PayMethod; e.CustomerName = r.CustomerName;
        e.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return o with { };
    }

    // Go parity: online-channel confirmed orders for one VN day (+bookingless),
    // searchable by order id / customer / ticket code, capped at 100.
    public async Task<List<object>> PendingPickupsAsync(string? date, string? search)
    {
        var tz = TimeZoneInfo.FindSystemTimeZoneById(
            OperatingSystem.IsWindows() ? "SE Asia Standard Time" : "Asia/Ho_Chi_Minh");
        DateOnly day;
        if (string.IsNullOrWhiteSpace(date))
            day = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));
        else if (!DateOnly.TryParseExact(date.Trim(), "yyyy-MM-dd", out day))
            throw ApiException.BadRequest("date must follow format YYYY-MM-DD", "validation");
        var from = TimeZoneInfo.ConvertTimeToUtc(day.ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified), tz);
        var to = from.AddDays(1);

        var q = _db.ComboOrders.AsNoTracking()
            .Where(x => x.Status == "confirmed" && x.SoldChannel == "online");
        if (!string.IsNullOrWhiteSpace(search))
        {
            // Go: id::text / user / ticket code ILIKE. Guid text has no EF translation,
            // so ids match exactly while names/codes match by substring.
            var s = search.Trim().ToLower();
            Guid? idHit = Guid.TryParse(s, out var g) ? g : null;
            q = q.Where(x => (idHit != null && x.Id == idHit.Value)
                || _db.Users.Any(u => u.Id == x.UserId && (u.FullName.ToLower().Contains(s) || u.Email.ToLower().Contains(s)))
                || _db.Tickets.Any(t => t.BookingId == x.BookingId && t.Code.ToLower().Contains(s)));
        }
        var orders = await q.OrderBy(x => x.CreatedAt).Take(100).ToListAsync();
        var out_ = new List<object>();
        foreach (var o in orders)
        {
            Guid? showId = null;
            if (o.BookingId != null)
            {
                var b = await _db.Bookings.AsNoTracking().SingleOrDefaultAsync(x => x.Id == o.BookingId);
                if (b == null) continue;
                var st = await _db.Showtimes.AsNoTracking().SingleOrDefaultAsync(x => x.Id == b.ShowtimeId);
                if (st == null || st.StartAt < from || st.StartAt >= to) continue;
                showId = st.Id;
            }
            string? userName = null, userMail = null;
            if (o.UserId != null)
            {
                var u = await _db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == o.UserId);
                if (u != null) { userName = u.FullName; userMail = u.Email; }
            }
            string? movieTitle = null;
            DateTime? showAt = null;
            if (showId != null)
            {
                var st = await _db.Showtimes.AsNoTracking().SingleAsync(x => x.Id == showId);
                var m = await _db.Movies.AsNoTracking().SingleOrDefaultAsync(x => x.Id == st.MovieId);
                movieTitle = m?.Title;
                showAt = st.StartAt;
            }
            var items = await _db.ComboOrderItems.AsNoTracking()
                .Where(x => x.ComboOrderId == o.Id).ToListAsync();
            out_.Add(new
            {
                order_id = o.Id,
                customer_name = userName ?? "",
                customer_email = userMail ?? "",
                booking_id = o.BookingId,
                movie_title = movieTitle,
                showtime_at = showAt,
                total = o.Total,
                items = items.Select(i => new
                {
                    combo_id = i.ComboId,
                    combo_name = i.ComboName,
                    quantity = i.Quantity,
                    unit_price = i.UnitPrice,
                    subtotal = i.UnitPrice * (long)i.Quantity,
                }).ToList(),
                created_at = o.CreatedAt,
            });
        }
        return out_;
    }

    public async Task CollectAsync(Guid id)
    {
        var n = await _db.ComboOrders.Where(x => x.Id == id && x.Status == "confirmed")
            .ExecuteUpdateAsync(x => x
                .SetProperty(o => o.Status, "collected")
                .SetProperty(o => o.UpdatedAt, DateTime.UtcNow));
        if (n == 0) throw ApiException.NotFound("order not found", "not_found");
    }

    private static void Validate(ComboRequest r)
    {
        var d = new Dictionary<string, string>();
        if (string.IsNullOrWhiteSpace(r.Name) || r.Name.Length > 255) d["name"] = "must be 1..255 chars";
        if (r.Price < 0) d["price"] = "must be >= 0";
        if (d.Count > 0) throw ApiException.Validation(d);
    }
}
