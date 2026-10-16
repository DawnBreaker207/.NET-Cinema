using Cinema.Api.Common;
using Cinema.Api.Data;
using Cinema.Api.Dtos;
using Cinema.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Cinema.Api.Services;

public sealed class ArticleService
{
    private readonly CinemaDbContext _db;
    public ArticleService(CinemaDbContext db) => _db = db;

    public static ArticleResponse ToDto(Article a) => new(a.Id, a.Title, a.Slug, a.Summary,
        a.ThumbnailUrl, a.Content, a.Type, a.Status, a.Views, a.CreatedAt, a.UpdatedAt);

    public async Task<(IReadOnlyList<ArticleResponse> Items, long Total)> PublicListAsync(int page, int pageSize)
    {
        var q = _db.Articles.AsNoTracking()
            .Where(x => x.Status == "published" && x.DeletedAt == null)
            .OrderByDescending(x => x.CreatedAt);
        var total = await q.LongCountAsync();
        var items = await q.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
        return (items.Select(ToDto).ToList(), total);
    }

    public async Task<ArticleResponse> PublicGetAsync(string slug)
    {
        var a = await _db.Articles.SingleOrDefaultAsync(x =>
                x.Slug == slug && x.Status == "published" && x.DeletedAt == null)
            ?? throw ApiException.NotFound("article not found", "not_found");
        a.Views += 1;
        await _db.SaveChangesAsync();
        return ToDto(a);
    }

    public async Task<(IReadOnlyList<ArticleResponse> Items, long Total)> AdminListAsync(int page, int pageSize, string? type = null)
    {
        // Go parity: only `type` filters (news/promotion); `search` is accepted by the
        // route contract but ignored by the Go backend, so it is ignored here too.
        var q = _db.Articles.AsNoTracking().Where(x => x.DeletedAt == null);
        if (!string.IsNullOrEmpty(type)) q = q.Where(x => x.Type == type);
        q = q.OrderByDescending(x => x.CreatedAt);
        var total = await q.LongCountAsync();
        var items = await q.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
        return (items.Select(ToDto).ToList(), total);
    }

    public async Task<ArticleResponse> AdminGetAsync(Guid id)
    {
        var a = await _db.Articles.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.DeletedAt == null)
            ?? throw ApiException.NotFound("article not found", "not_found");
        return ToDto(a);
    }

    public async Task<ArticleResponse> CreateAsync(Guid authorId, ArticleRequest r)
    {
        ValidateCreate(r);
        var slug = Slug(r.Title!);
        if (await _db.Articles.AnyAsync(x => x.Slug == slug && x.DeletedAt == null))
            slug += "-" + Guid.NewGuid().ToString("N")[..6];
        var now = DateTime.UtcNow;
        var a = new Article
        {
            Id = Guid.NewGuid(),
            Title = r.Title!.Trim(),
            Slug = slug,
            Summary = r.Summary,
            ThumbnailUrl = r.ThumbnailUrl,
            Content = r.Content!,
            AuthorId = authorId,
            Type = r.Type ?? "news",
            Status = r.Status ?? "draft",
            CreatedAt = now,
            UpdatedAt = now,
        };
        _db.Articles.Add(a);
        await _db.SaveChangesAsync();
        return ToDto(a);
    }

    // Go partial update: only provided fields change (publish/hide sends status only).
    public async Task<ArticleResponse> UpdateAsync(Guid id, ArticleRequest r)
    {
        var a = await _db.Articles.SingleOrDefaultAsync(x => x.Id == id && x.DeletedAt == null)
            ?? throw ApiException.NotFound("article not found", "not_found");
        var d = new Dictionary<string, string>();
        if (r.Title != null)
        {
            if (string.IsNullOrWhiteSpace(r.Title) || r.Title.Length > 255) d["title"] = "must be 1..255 chars";
            else a.Title = r.Title.Trim();
        }
        if (r.Summary != null)
        {
            if (r.Summary.Length > 500) d["summary"] = "max 500 chars";
            else a.Summary = r.Summary.Trim();
        }
        if (r.ThumbnailUrl != null)
        {
            if (r.ThumbnailUrl.Length > 1024) d["thumbnail_url"] = "max 1024 chars";
            else a.ThumbnailUrl = r.ThumbnailUrl.Trim();
        }
        if (r.Content != null)
        {
            if (string.IsNullOrWhiteSpace(r.Content)) d["content"] = "required";
            else a.Content = r.Content;
        }
        if (r.Type != null)
        {
            if (r.Type is not ("news" or "promotion")) d["type"] = "must be news or promotion";
            else a.Type = r.Type;
        }
        if (r.Status != null)
        {
            if (r.Status is not ("draft" or "published" or "hidden")) d["status"] = "unknown status";
            else a.Status = r.Status;
        }
        if (d.Count > 0) throw ApiException.Validation(d);
        a.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return ToDto(a);
    }

    public async Task DeleteAsync(Guid id)
    {
        var a = await _db.Articles.SingleOrDefaultAsync(x => x.Id == id && x.DeletedAt == null)
            ?? throw ApiException.NotFound("article not found", "not_found");
        a.DeletedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
    }

    private static void ValidateCreate(ArticleRequest r)
    {
        var d = new Dictionary<string, string>();
        if (string.IsNullOrWhiteSpace(r.Title) || r.Title!.Length > 255) d["title"] = "must be 1..255 chars";
        if (string.IsNullOrWhiteSpace(r.Content)) d["content"] = "required";
        if (r.Type != null && r.Type is not ("news" or "promotion")) d["type"] = "must be news or promotion";
        if (r.Status != null && r.Status is not ("draft" or "published" or "hidden")) d["status"] = "unknown status";
        if (d.Count > 0) throw ApiException.Validation(d);
    }

    private static string Slug(string title)
    {
        var s = new string(title.ToLowerInvariant()
            .Select(c => char.IsLetterOrDigit(c) ? c : '-').ToArray());
        while (s.Contains("--")) s = s.Replace("--", "-");
        s = s.Trim('-');
        return s.Length == 0 ? Guid.NewGuid().ToString("N")[..8] : s[..Math.Min(s.Length, 200)];
    }
}
