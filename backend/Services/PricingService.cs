using Cinema.Api.Common;
using Cinema.Api.Data;
using Cinema.Api.Dtos;
using Cinema.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Cinema.Api.Services;

// Mirrors Go pricing_service.priceFor: base + active rules (priority DESC,
// created_at ASC); percent compounds on the running total; floor 0.
// Times evaluated in Asia/Ho_Chi_Minh like Go.
public sealed class PricingService
{
    private static readonly TimeZoneInfo VnTz =
        TimeZoneInfo.FindSystemTimeZoneById(
            OperatingSystem.IsWindows() ? "SE Asia Standard Time" : "Asia/Ho_Chi_Minh");

    private readonly CinemaDbContext _db;
    public PricingService(CinemaDbContext db) => _db = db;

    public async Task<Dictionary<string, long>> BasePricesAsync()
        => await _db.SeatBasePrices.AsNoTracking()
            .ToDictionaryAsync(x => x.SeatType, x => (long)x.Price);

    public async Task<List<PricingRule>> ActiveRulesAsync()
        => await _db.PricingRules.AsNoTracking()
            .Where(x => x.Active)
            .OrderByDescending(x => x.Priority).ThenBy(x => x.CreatedAt)
            .ToListAsync();

    public async Task<Dictionary<string, long>> QuoteForAsync(DateTime startAtUtc, IEnumerable<string> seatTypes)
    {
        var bases = await BasePricesAsync();
        var rules = await ActiveRulesAsync();
        var local = TimeZoneInfo.ConvertTimeFromUtc(
            startAtUtc.Kind == DateTimeKind.Utc ? startAtUtc : startAtUtc.ToUniversalTime(), VnTz);
        return seatTypes.Distinct().ToDictionary(
            t => t,
            t => PriceFor(bases.GetValueOrDefault(t), rules, local).Final);
    }

    public (long Final, List<AppliedRuleResponse> Applied) QuoteOne(
        long @base, List<PricingRule> rules, DateTime localStart)
        => PriceFor(@base, rules, localStart);

    public static DateTime ToVn(DateTime utc)
        => TimeZoneInfo.ConvertTimeFromUtc(
            utc.Kind == DateTimeKind.Utc ? utc : utc.ToUniversalTime(), VnTz);

    private static (long Final, List<AppliedRuleResponse> Applied) PriceFor(
        long @base, List<PricingRule> rules, DateTime local)
    {
        var applied = new List<AppliedRuleResponse>();
        var running = @base;
        var weekday = (short)local.DayOfWeek;
        var dateStr = local.ToString("yyyy-MM-dd");
        var clock = local.TimeOfDay;
        foreach (var r in rules)
        {
            if (!Matches(r, weekday, dateStr, clock)) continue;
            if (r.AdjustKind == "percent") running += running * r.AdjustValue / 100;
            else if (r.AdjustKind == "fixed") running += r.AdjustValue;
            else continue;
            applied.Add(new AppliedRuleResponse(r.Id, r.Name, r.AdjustKind, r.AdjustValue));
        }
        return (Math.Max(0, running), applied);
    }

    private static bool Matches(PricingRule r, short weekday, string dateStr, TimeSpan clock)
    {
        bool day = r.SpecificDate != null
            ? r.SpecificDate.Value.ToString("yyyy-MM-dd") == dateStr
            : r.DayOfWeek == null || r.DayOfWeek == weekday;
        if (!day) return false;
        var start = r.StartTime?.ToTimeSpan();
        var end = r.EndTime?.ToTimeSpan();
        if (start != null && end != null) return clock >= start && clock <= end;
        if (start != null) return clock >= start;
        if (end != null) return clock <= end;
        return true;
    }

    // ---- admin + public API ----
    public async Task<List<BasePriceResponse>> AdminGetBaseAsync()
        => (await BasePricesAsync()).Select(kv => new BasePriceResponse(kv.Key, kv.Value)).ToList();

    public async Task<List<BasePriceResponse>> AdminSetBaseAsync(Dictionary<string, long> prices)
    {
        var allowed = new[] { "standard", "vip", "couple", "recliner" };
        foreach (var t in allowed)
            if (!prices.TryGetValue(t, out var v) || v < 0)
                throw ApiException.Validation(new() { ["prices"] = $"missing or negative base for {t}" });
        var now = DateTime.UtcNow;
        foreach (var t in allowed)
        {
            var row = await _db.SeatBasePrices.SingleOrDefaultAsync(x => x.SeatType == t);
            if (row is null) _db.SeatBasePrices.Add(new SeatBasePrice { SeatType = t, Price = (int)prices[t], UpdatedAt = now });
            else { row.Price = (int)prices[t]; row.UpdatedAt = now; }
        }
        await _db.SaveChangesAsync();
        return await AdminGetBaseAsync();
    }

    public async Task<object> PublicPricesAsync()
    {
        var bases = await BasePricesAsync();
        var order = new[] { "standard", "vip", "couple", "recliner" };
        return new
        {
            from_price = bases.Count > 0 ? bases.Values.Min() : 0,
            prices = order.Where(bases.ContainsKey).ToDictionary(t => t, t => bases[t]),
        };
    }

    public async Task<PricingQuoteResponse> QuoteAsync(Guid showtimeId)
    {
        var s = await _db.Showtimes.AsNoTracking().SingleOrDefaultAsync(x => x.Id == showtimeId)
            ?? throw ApiException.NotFound("showtime not found", "not_found");
        var bases = await BasePricesAsync();
        var rules = await ActiveRulesAsync();
        var local = ToVn(s.StartAt);
        var total = 0L;
        var applied = new List<AppliedRuleResponse>();
        foreach (var t in new[] { "standard", "vip", "couple", "recliner" })
        {
            var (final, ap) = PriceFor(bases.GetValueOrDefault(t), rules, local);
            total += final;
            applied.AddRange(ap);
        }
        return new PricingQuoteResponse(bases.Values.Sum(), applied.DistinctBy(a => a.RuleId).ToList(), total);
    }

    private static PricingRuleResponse ToRule(PricingRule r) => new(r.Id, r.Name, r.DayOfWeek,
        r.StartTime?.ToString("HH:mm:ss"), r.EndTime?.ToString("HH:mm:ss"),
        r.SpecificDate?.ToString("yyyy-MM-dd"), r.AdjustKind, r.AdjustValue,
        r.Priority, r.Active);

    public async Task<(List<PricingRuleResponse> Items, long Total)> RulesAsync(
        string? search, int page, int pageSize)
    {
        var q = _db.PricingRules.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLower();
            q = q.Where(x => x.Name.ToLower().Contains(s));
        }
        var total = await q.LongCountAsync();
        var rows = await q.OrderByDescending(x => x.Priority).ThenByDescending(x => x.CreatedAt)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
        return (rows.Select(ToRule).ToList(), total);
    }

    public async Task<PricingRuleResponse> RuleGetAsync(Guid id)
    {
        var r = await _db.PricingRules.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id)
            ?? throw ApiException.NotFound("rule not found", "not_found");
        return ToRule(r);
    }

    public async Task<PricingRuleResponse> RuleCreateAsync(PricingRuleRequest q)
    {
        var d = new Dictionary<string, string>();
        if (string.IsNullOrWhiteSpace(q.Name) || q.Name!.Length > 255) d["name"] = "must be 1..255 chars";
        if (q.DayOfWeek is < 0 or > 6) d["day_of_week"] = "must be 0..6";
        if (q.AdjustKind is not ("percent" or "fixed")) d["adjust_kind"] = "must be percent or fixed";
        if ((q.Priority ?? 0) < 0) d["priority"] = "must be >= 0";
        TimeOnly? st = ParseClockStrict(q.StartTime, "start_time", d);
        TimeOnly? en = ParseClockStrict(q.EndTime, "end_time", d);
        DateOnly? spec = ParseDateStrict(q.SpecificDate, "specific_date", d);
        if (d.Count > 0) throw ApiException.Validation(d);
        if (st != null && en != null && en <= st)
            throw ApiException.Validation(new() { ["end_time"] = "end_time must be after start_time" });
        var r = new PricingRule
        {
            Id = Guid.NewGuid(),
            Name = q.Name!.Trim(),
            DayOfWeek = q.DayOfWeek,
            StartTime = st,
            EndTime = en,
            SpecificDate = spec,
            AdjustKind = q.AdjustKind!,
            AdjustValue = (int)(q.AdjustValue ?? 0),
            Priority = q.Priority ?? 0,
            Active = q.Active ?? true,
        };
        var now = DateTime.UtcNow;
        r.CreatedAt = now; r.UpdatedAt = now;
        _db.PricingRules.Add(r);
        await _db.SaveChangesAsync();
        return ToRule(r);
    }

    // Go partial update: empty PATCH is rejected; "" clears nullable fields.
    public async Task<PricingRuleResponse> RuleUpdateAsync(Guid id, PricingRuleRequest q)
    {
        if (q.Name == null && q.DayOfWeek == null && q.StartTime == null && q.EndTime == null
            && q.SpecificDate == null && q.AdjustKind == null && q.AdjustValue == null
            && q.Priority == null && q.Active == null)
            throw ApiException.Validation(new() { ["_"] = "nothing to update" });
        var r = await _db.PricingRules.SingleOrDefaultAsync(x => x.Id == id)
            ?? throw ApiException.NotFound("pricing rule not found", "pricing_rule_not_found");
        var d = new Dictionary<string, string>();
        if (q.Name != null)
        {
            if (string.IsNullOrWhiteSpace(q.Name) || q.Name.Length > 255) d["name"] = "must be 1..255 chars";
            else r.Name = q.Name.Trim();
        }
        if (q.DayOfWeek != null)
        {
            if (q.DayOfWeek is < 0 or > 6) d["day_of_week"] = "must be 0..6";
            else r.DayOfWeek = q.DayOfWeek;
        }
        if (q.StartTime != null) r.StartTime = ParseClockStrict(q.StartTime, "start_time", d, allowEmpty: true);
        if (q.EndTime != null) r.EndTime = ParseClockStrict(q.EndTime, "end_time", d, allowEmpty: true);
        if (q.SpecificDate != null) r.SpecificDate = ParseDateStrict(q.SpecificDate, "specific_date", d, allowEmpty: true);
        if (q.AdjustKind != null)
        {
            if (q.AdjustKind is not ("percent" or "fixed")) d["adjust_kind"] = "must be percent or fixed";
            else r.AdjustKind = q.AdjustKind;
        }
        if (q.AdjustValue != null) r.AdjustValue = (int)q.AdjustValue.Value;
        if (q.Priority != null)
        {
            if (q.Priority < 0) d["priority"] = "must be >= 0";
            else r.Priority = q.Priority.Value;
        }
        if (q.Active != null) r.Active = q.Active.Value;
        if (d.Count > 0) throw ApiException.Validation(d);
        if (r.StartTime != null && r.EndTime != null && r.EndTime <= r.StartTime)
            throw ApiException.Validation(new() { ["end_time"] = "end_time must be after start_time" });
        r.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return ToRule(r);
    }

    public async Task RuleDeleteAsync(Guid id)
    {
        var n = await _db.PricingRules.Where(x => x.Id == id).ExecuteDeleteAsync();
        if (n == 0) throw ApiException.NotFound("rule not found", "not_found");
    }

    // Go parseClockTime/parseSpecificDate: nil leaves alone; "" clears; bad format rejects.
    private static TimeOnly? ParseClockStrict(string? raw, string key, Dictionary<string, string> d, bool allowEmpty = false)
    {
        if (raw == null) return null;
        var t = raw.Trim();
        if (t == "") return null;
        foreach (var fmt in new[] { "HH:mm:ss", "HH:mm" })
            if (TimeOnly.TryParseExact(t, fmt, out var v)) return v;
        d[key] = "start_time/end_time must be HH:MM or HH:MM:SS, with end_time after start_time";
        return null;
    }

    private static DateOnly? ParseDateStrict(string? raw, string key, Dictionary<string, string> d, bool allowEmpty = false)
    {
        if (raw == null) return null;
        var t = raw.Trim();
        if (t == "") return null;
        if (DateOnly.TryParseExact(t, "yyyy-MM-dd", out var v)) return v;
        d[key] = "specific_date must be YYYY-MM-DD";
        return null;
    }

    private static PricingRule ValidateRule(PricingRule r, PricingRuleRequest q)
    {
        // Legacy full-replace path (kept for completeness); create/update use the Go-parity methods above.
        var d = new Dictionary<string, string>();
        if (string.IsNullOrWhiteSpace(q.Name)) d["name"] = "required";
        if (q.DayOfWeek is < 0 or > 6) d["day_of_week"] = "must be 0..6";
        if (q.AdjustKind is not ("percent" or "fixed")) d["adjust_kind"] = "must be percent or fixed";
        TimeOnly? st = ParseClock(q.StartTime, "start_time", d);
        TimeOnly? en = ParseClock(q.EndTime, "end_time", d);
        DateOnly? spec = null;
        if (q.SpecificDate != null)
        {
            if (!DateOnly.TryParseExact(q.SpecificDate, "yyyy-MM-dd", out var sd))
                d["specific_date"] = "must match yyyy-MM-dd";
            else spec = sd;
        }
        if (d.Count > 0) throw ApiException.Validation(d);
        r.Name = q.Name!.Trim(); r.DayOfWeek = q.DayOfWeek; r.StartTime = st; r.EndTime = en;
        r.SpecificDate = spec; r.AdjustKind = q.AdjustKind!; r.AdjustValue = (int)(q.AdjustValue ?? 0);
        r.Priority = q.Priority ?? 0; r.Active = q.Active ?? r.Active;
        if (r.Active && q.Active == null && r.Id == Guid.Empty) r.Active = true;
        return r;
    }

    private static TimeOnly? ParseClock(string? raw, string key, Dictionary<string, string> d)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        foreach (var fmt in new[] { "HH:mm:ss", "HH:mm" })
            if (TimeOnly.TryParseExact(raw.Trim(), fmt, out var t)) return t;
        d[key] = "must match HH:mm[:ss]";
        return null;
    }
}
