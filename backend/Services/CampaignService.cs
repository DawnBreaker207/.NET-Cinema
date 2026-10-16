using Cinema.Api.Common;
using Cinema.Api.Data;
using Cinema.Api.Dtos;
using Cinema.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Cinema.Api.Services;

public sealed class CampaignService
{
    private readonly CinemaDbContext _db;
    public CampaignService(CinemaDbContext db) => _db = db;

    public static CampaignResponse ToDto(Campaign c)
        => new(c.Id, c.Name, c.Description, c.StartsAt, c.EndsAt, c.Active, c.PerUserLimit, c.CreatedAt, c.UpdatedAt);
    public static DiscountResponse ToDiscount(DiscountCode d)
        => new(d.Id, d.Code, d.Description, d.Kind, d.Value, d.MaxDiscount, d.MinOrder,
            d.StartsAt, d.EndsAt, d.MaxUses, d.UsedCount, d.Active, d.CampaignId);

    private static bool Live(Campaign c, DateTime now) => c.Active && c.StartsAt <= now && c.EndsAt >= now;

    public async Task<(IReadOnlyList<object> Items, long Total)> PublicListAsync(int page, int pageSize)
    {
        var now = DateTime.UtcNow;
        var q = _db.Campaigns.AsNoTracking()
            .Where(x => x.Active && x.StartsAt <= now && x.EndsAt >= now)
            .OrderBy(x => x.StartsAt);
        var total = await q.LongCountAsync();
        var rows = await q.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
        var out_ = new List<object>();
        foreach (var c in rows) out_.Add(await PublicDetailAsync(c));
        return (out_, total);
    }

    public async Task<object> PublicGetAsync(Guid id)
    {
        var now = DateTime.UtcNow;
        var c = await _db.Campaigns.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == id && x.Active && x.StartsAt <= now && x.EndsAt >= now)
            ?? throw ApiException.NotFound("campaign not found", "not_found");
        return await PublicDetailAsync(c);
    }

    private async Task<object> PublicDetailAsync(Campaign c)
    {
        var codes = await _db.DiscountCodes.AsNoTracking()
            .Where(x => x.CampaignId == c.Id && x.DeletedAt == null && x.Active).ToListAsync();
        var comboRows = await _db.CampaignCombos.AsNoTracking()
            .Where(x => x.CampaignId == c.Id).ToListAsync();
        var combos = new List<object>();
        foreach (var cc in comboRows)
        {
            var i = await _db.ConcessionItems.AsNoTracking()
                .SingleOrDefaultAsync(x => x.Id == cc.ComboId && x.DeletedAt == null && x.Active);
            if (i is null) continue;
            combos.Add(new
            {
                combo_id = i.Id,
                name = i.Name,
                price = i.Price,
                promo_price = cc.PromoPrice,
            });
        }
        var articles = await _db.CampaignArticles.AsNoTracking().Where(x => x.CampaignId == c.Id)
            .Join(_db.Articles.AsNoTracking(), ca => ca.ArticleId, a => a.Id, (ca, a) => a)
            .Where(a => a.Status == "published" && a.DeletedAt == null)
            .Select(a => ArticleService.ToDto(a)).ToListAsync();
        return new
        {
            id = c.Id,
            name = c.Name,
            description = c.Description,
            starts_at = c.StartsAt,
            ends_at = c.EndsAt,
            discount_codes = codes.Select(d => new
            {
                code = d.Code,
                remaining = d.MaxUses == null ? (int?)null : Math.Max(0, d.MaxUses.Value - d.UsedCount),
            }).ToList(),
            combos,
            articles,
        };
    }

    public async Task<(List<CampaignResponse> Items, long Total)> AdminListAsync(
        string? search, bool? active, int page, int pageSize)
    {
        var q = _db.Campaigns.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLower();
            q = q.Where(x => x.Name.ToLower().Contains(s) || (x.Description != null && x.Description.ToLower().Contains(s)));
        }
        if (active != null) q = q.Where(x => x.Active == active);
        var total = await q.LongCountAsync();
        var items = await q.OrderByDescending(x => x.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(c => new CampaignResponse(c.Id, c.Name, c.Description, c.StartsAt, c.EndsAt, c.Active, c.PerUserLimit, c.CreatedAt, c.UpdatedAt))
            .ToListAsync();
        return (items, total);
    }

    public async Task<object> AdminGetAsync(Guid id)
    {
        var c = await _db.Campaigns.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id)
            ?? throw ApiException.NotFound("campaign not found", "not_found");
        // Go CampaignDetailResponse: flat campaign fields + links (combo_id key, full DTOs).
        var combos = await _db.CampaignCombos.AsNoTracking().Where(x => x.CampaignId == id)
            .Join(_db.ConcessionItems.AsNoTracking(), cc => cc.ComboId, i => i.Id,
                (cc, i) => new { combo_id = i.Id, name = i.Name, price = i.Price, promo_price = cc.PromoPrice })
            .ToListAsync();
        var articles = await _db.CampaignArticles.AsNoTracking().Where(x => x.CampaignId == id)
            .Join(_db.Articles.AsNoTracking(), ca => ca.ArticleId, a => a.Id, (ca, a) => a)
            .ToListAsync();
        var codes = await _db.DiscountCodes.AsNoTracking()
            .Where(x => x.CampaignId == id && x.DeletedAt == null)
            .ToListAsync();
        return new
        {
            id = c.Id,
            name = c.Name,
            description = c.Description,
            starts_at = c.StartsAt,
            ends_at = c.EndsAt,
            active = c.Active,
            per_user_limit = c.PerUserLimit,
            created_at = c.CreatedAt,
            updated_at = c.UpdatedAt,
            discount_codes = codes.Select(ToDiscount).ToList(),
            combos,
            articles = articles.Select(ArticleService.ToDto).ToList(),
        };
    }

    public async Task<CampaignResponse> CreateAsync(CampaignRequest r)
    {
        ValidateCreate(r);
        var now = DateTime.UtcNow;
        var c = new Campaign
        {
            Id = Guid.NewGuid(),
            Name = r.Name!.Trim(),
            Description = r.Description,
            StartsAt = r.StartsAt!.Value.ToUniversalTime(),
            EndsAt = r.EndsAt!.Value.ToUniversalTime(),
            Active = r.Active ?? false,
            PerUserLimit = r.PerUserLimit ?? 1,
            CreatedAt = now,
            UpdatedAt = now,
        };
        _db.Campaigns.Add(c);
        await _db.SaveChangesAsync();
        return ToDto(c);
    }

    // Go partial update: only provided fields change; empty PATCH is rejected.
    public async Task<CampaignResponse> UpdateAsync(Guid id, CampaignRequest r)
    {
        if (r.Name == null && r.Description == null && r.StartsAt == null
            && r.EndsAt == null && r.PerUserLimit == null && r.Active == null)
            throw ApiException.Validation(new() { ["_"] = "nothing to update" });
        var c = await _db.Campaigns.SingleOrDefaultAsync(x => x.Id == id)
            ?? throw ApiException.NotFound("campaign not found", "not_found");
        var d = new Dictionary<string, string>();
        if (r.Name != null)
        {
            if (string.IsNullOrWhiteSpace(r.Name) || r.Name.Length > 255) d["name"] = "must be 1..255 chars";
            else c.Name = r.Name.Trim();
        }
        if (r.Description != null)
        {
            if (r.Description.Length > 2000) d["description"] = "max 2000 chars";
            else c.Description = r.Description;
        }
        if (r.StartsAt != null) c.StartsAt = r.StartsAt.Value.ToUniversalTime();
        if (r.EndsAt != null) c.EndsAt = r.EndsAt.Value.ToUniversalTime();
        if (c.EndsAt <= c.StartsAt) d["ends_at"] = "must be after starts_at";
        if (r.PerUserLimit != null)
        {
            if (r.PerUserLimit < 1) d["per_user_limit"] = "must be >= 1";
            else c.PerUserLimit = r.PerUserLimit.Value;
        }
        if (r.Active != null) c.Active = r.Active.Value;
        if (d.Count > 0) throw ApiException.Validation(d);
        c.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return ToDto(c);
    }

    public async Task DeleteAsync(Guid id)
    {
        var c = await _db.Campaigns.SingleOrDefaultAsync(x => x.Id == id)
            ?? throw ApiException.NotFound("campaign not found", "not_found");
        _db.Campaigns.Remove(c);
        await _db.SaveChangesAsync();
    }

    public async Task AttachComboAsync(Guid id, Guid comboId, int? promoPrice)
    {
        await RequireCampaignAsync(id);
        if (!await _db.ConcessionItems.AnyAsync(x => x.Id == comboId && x.DeletedAt == null))
            throw ApiException.NotFound("combo not found", "not_found");
        if (await _db.CampaignCombos.AnyAsync(x => x.CampaignId == id && x.ComboId == comboId))
            return;
        _db.CampaignCombos.Add(new CampaignCombo { CampaignId = id, ComboId = comboId, PromoPrice = promoPrice });
        await _db.SaveChangesAsync();
    }

    public async Task DetachComboAsync(Guid id, Guid comboId)
    {
        await _db.CampaignCombos.Where(x => x.CampaignId == id && x.ComboId == comboId).ExecuteDeleteAsync();
    }

    public async Task AttachArticleAsync(Guid id, Guid articleId)
    {
        await RequireCampaignAsync(id);
        if (!await _db.Articles.AnyAsync(x => x.Id == articleId && x.DeletedAt == null))
            throw ApiException.NotFound("article not found", "not_found");
        if (await _db.CampaignArticles.AnyAsync(x => x.CampaignId == id && x.ArticleId == articleId))
            return;
        _db.CampaignArticles.Add(new CampaignArticle { CampaignId = id, ArticleId = articleId });
        await _db.SaveChangesAsync();
    }

    public async Task DetachArticleAsync(Guid id, Guid articleId)
    {
        await _db.CampaignArticles.Where(x => x.CampaignId == id && x.ArticleId == articleId).ExecuteDeleteAsync();
    }

    public async Task AttachDiscountAsync(Guid id, Guid codeId)
    {
        await RequireCampaignAsync(id);
        var d = await _db.DiscountCodes.SingleOrDefaultAsync(x => x.Id == codeId && x.DeletedAt == null)
            ?? throw ApiException.NotFound("discount code not found", "discount_not_found");
        d.CampaignId = id;
        await _db.SaveChangesAsync();
    }

    public async Task DetachDiscountAsync(Guid id, Guid codeId)
    {
        var d = await _db.DiscountCodes.SingleOrDefaultAsync(x => x.Id == codeId && x.CampaignId == id);
        if (d is null) return;
        d.CampaignId = null;
        await _db.SaveChangesAsync();
    }

    // ---- discounts ----
    public async Task<(List<DiscountResponse> Items, long Total)> DiscountListAsync(
        string? search, bool? active, int page, int pageSize)
    {
        var q = _db.DiscountCodes.AsNoTracking().Where(x => x.DeletedAt == null);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLower();
            q = q.Where(x => x.Code.ToLower().Contains(s) || (x.Description != null && x.Description.ToLower().Contains(s)));
        }
        if (active != null) q = q.Where(x => x.Active == active);
        var total = await q.LongCountAsync();
        var items = await q.OrderByDescending(x => x.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(d => ToDiscount(d)).ToListAsync();
        return (items, total);
    }

    public async Task<DiscountResponse> DiscountGetAsync(Guid id)
    {
        var d = await _db.DiscountCodes.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.DeletedAt == null)
            ?? throw ApiException.NotFound("discount code not found", "discount_not_found");
        return ToDiscount(d);
    }

    public async Task<DiscountResponse> DiscountCreateAsync(DiscountRequest r)
    {
        var code = (r.Code ?? "").Trim().ToUpperInvariant();
        var e = new Dictionary<string, string>();
        if (code.Length is < 3 or > 32) e["code"] = "must be 3..32 chars";
        if (r.Kind is not ("percent" or "amount")) e["kind"] = "must be percent or amount";
        if ((r.Value ?? 0) < 1) e["value"] = "must be >= 1";
        if (e.Count > 0) throw ApiException.Validation(e);
        CheckDiscountShape(r.Kind!, r.Value!.Value, r.MaxDiscount, r.StartsAt, r.EndsAt);
        if (await _db.DiscountCodes.AnyAsync(x => x.Code == code && x.DeletedAt == null))
            throw ApiException.Conflict("this discount code already exists", "discount_code_exists");
        var now = DateTime.UtcNow;
        var d = new DiscountCode
        {
            Id = Guid.NewGuid(),
            Code = code,
            Description = (r.Description ?? "").Trim(),
            Kind = r.Kind!,
            Value = r.Value!.Value,
            MaxDiscount = r.Kind == "percent" ? r.MaxDiscount : null,
            MinOrder = r.MinOrder ?? 0,
            StartsAt = r.StartsAt?.ToUniversalTime(),
            EndsAt = r.EndsAt?.ToUniversalTime(),
            MaxUses = r.MaxUses,
            UsedCount = 0,
            Active = r.Active ?? true,
            CreatedAt = now,
            UpdatedAt = now,
        };
        _db.DiscountCodes.Add(d);
        await _db.SaveChangesAsync();
        return ToDiscount(d);
    }

    // Go partial update: code/kind are immutable; empty PATCH is rejected.
    public async Task<DiscountResponse> DiscountUpdateAsync(Guid id, DiscountRequest r)
    {
        if (r.Description == null && r.Value == null && r.MaxDiscount == null && r.MinOrder == null
            && r.StartsAt == null && r.EndsAt == null && r.MaxUses == null && r.Active == null)
            throw ApiException.Validation(new() { ["_"] = "nothing to update" });
        var d = await _db.DiscountCodes.SingleOrDefaultAsync(x => x.Id == id && x.DeletedAt == null)
            ?? throw ApiException.NotFound("discount code not found", "discount_not_found");
        var e = new Dictionary<string, string>();
        if (r.Description != null)
        {
            if (r.Description.Length > 2000) e["description"] = "max 2000 chars";
            else d.Description = r.Description.Trim();
        }
        if (r.Value != null)
        {
            if (r.Value < 1) e["value"] = "must be >= 1";
            else d.Value = r.Value.Value;
        }
        if (r.MaxDiscount != null)
        {
            if (r.MaxDiscount <= 0) e["max_discount"] = "must be > 0";
            else d.MaxDiscount = r.MaxDiscount;
        }
        if (r.MinOrder != null)
        {
            if (r.MinOrder < 0) e["min_order"] = "must be >= 0";
            else d.MinOrder = r.MinOrder.Value;
        }
        if (r.StartsAt != null) d.StartsAt = r.StartsAt.Value.ToUniversalTime();
        if (r.EndsAt != null) d.EndsAt = r.EndsAt.Value.ToUniversalTime();
        if (r.MaxUses != null)
        {
            if (r.MaxUses <= 0) e["max_uses"] = "must be > 0";
            else d.MaxUses = r.MaxUses;
        }
        if (r.Active != null) d.Active = r.Active.Value;
        if (e.Count > 0) throw ApiException.Validation(e);
        CheckDiscountShape(d.Kind, d.Value, d.MaxDiscount, d.StartsAt, d.EndsAt);
        d.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return ToDiscount(d);
    }

    private static void CheckDiscountShape(string kind, long value, long? maxDiscount, DateTime? startsAt, DateTime? endsAt)
    {
        if (kind == "percent" && (value < 1 || value > 100))
            throw ApiException.Validation(new() { ["value"] = "a percentage discount must be between 1 and 100" });
        if (kind == "amount" && maxDiscount != null)
            throw ApiException.Validation(new() { ["max_discount"] = "max_discount only applies to a percentage code" });
        if (startsAt != null && endsAt != null && endsAt <= startsAt)
            throw ApiException.Validation(new() { ["ends_at"] = "must be after starts_at" });
    }

    public async Task DiscountDeleteAsync(Guid id)
    {
        var d = await _db.DiscountCodes.SingleOrDefaultAsync(x => x.Id == id && x.DeletedAt == null)
            ?? throw ApiException.NotFound("discount code not found", "discount_not_found");
        d.DeletedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
    }

    private async Task RequireCampaignAsync(Guid id)
    {
        if (!await _db.Campaigns.AnyAsync(x => x.Id == id))
            throw ApiException.NotFound("campaign not found", "not_found");
    }

    private static void ValidateCreate(CampaignRequest r)
    {
        var d = new Dictionary<string, string>();
        if (string.IsNullOrWhiteSpace(r.Name) || r.Name!.Length > 255) d["name"] = "must be 1..255 chars";
        if (r.StartsAt == null || r.EndsAt == null || r.EndsAt <= r.StartsAt) d["ends_at"] = "must be after starts_at";
        if ((r.PerUserLimit ?? 1) < 1) d["per_user_limit"] = "must be >= 1";
        if (d.Count > 0) throw ApiException.Validation(d);
    }

    private static void Validate(CampaignRequest r) => ValidateCreate(r);

}
