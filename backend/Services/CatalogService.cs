using Cinema.Api.Common;
using Cinema.Api.Data;
using Cinema.Api.Dtos;
using Cinema.Api.Models;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Cinema.Api.Services;

// Mirrors Go movie service rules (F2): customers never see drafts;
// delete/status/duration changes blocked while upcoming showtimes exist.
public sealed class CatalogService
{
    private static readonly HashSet<string> Sorts = new() { "release_date", "title", "created_at" };
    private static readonly HashSet<string> AgeRatings = new() { "P", "K", "T13", "T16", "T18" };
    private static readonly HashSet<string> Statuses = new() { "draft", "coming_soon", "showing", "ended" };

    private readonly CinemaDbContext _db;
    public CatalogService(CinemaDbContext db) => _db = db;

    public static MovieResponse ToDto(Movie m) => new(m.Id, m.Title, m.Genre, m.Duration,
        m.Director, m.Description, m.PosterUrl, m.BackdropUrl, m.TrailerUrl,
        m.CastMembers, m.AgeRating, m.ReleaseDate.ToString("yyyy-MM-dd"), m.Status,
        m.CreatedAt, m.UpdatedAt);

    public async Task<(IReadOnlyList<MovieResponse> Items, long Total)> ListAsync(
        string? status, string? genre, string? search, string sort, string order,
        int page, int pageSize, bool isOperator)
    {
        if (status != null && !Statuses.Contains(status))
            throw ApiException.Validation(new() { ["status"] = "unknown status" });
        if (!Sorts.Contains(sort))
            throw ApiException.Validation(new() { ["sort"] = "unknown sort field" });
        if (order is not ("asc" or "desc"))
            throw ApiException.Validation(new() { ["order"] = "must be asc or desc" });

        var q = _db.Movies.AsNoTracking().Where(x => x.DeletedAt == null);
        if (!isOperator) q = q.Where(x => x.Status == "showing");
        else if (status != null) q = q.Where(x => x.Status == status);
        if (genre != null) q = q.Where(x => x.Genre.ToLower() == genre.ToLower());
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = "%" + search.Trim().ToLower() + "%";
            q = q.Where(x => EF.Functions.ILike(x.Title, s) || EF.Functions.ILike(x.Genre, s));
        }
        var total = await q.LongCountAsync();
        q = (sort, order) switch
        {
            ("title", "asc") => q.OrderBy(x => x.Title).ThenBy(x => x.Id),
            ("title", "desc") => q.OrderByDescending(x => x.Title).ThenBy(x => x.Id),
            ("release_date", "asc") => q.OrderBy(x => x.ReleaseDate).ThenBy(x => x.Id),
            ("release_date", "desc") => q.OrderByDescending(x => x.ReleaseDate).ThenBy(x => x.Id),
            ("created_at", "asc") => q.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id),
            _ => q.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id),
        };
        var items = await q.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
        return (items.Select(ToDto).ToList(), total);
    }

    public async Task<MovieResponse> GetAsync(Guid id, bool isOperator)
    {
        var m = await _db.Movies.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == id && x.DeletedAt == null)
            ?? throw ApiException.NotFound("movie not found", "not_found");
        if (!isOperator && m.Status != "showing")
            throw ApiException.NotFound("movie not found", "not_found");
        return ToDto(m);
    }

    public async Task<MovieResponse> CreateAsync(MovieRequest r)
    {
        var m = Validate(new Movie(), r, isNew: true);
        m.Id = Guid.NewGuid();
        var now = DateTime.UtcNow;
        m.CreatedAt = now; m.UpdatedAt = now;
        _db.Movies.Add(m);
        await _db.SaveChangesAsync();
        return ToDto(m);
    }

    public async Task<MovieResponse> UpdateAsync(Guid id, MovieRequest r)
    {
        var m = await _db.Movies.SingleOrDefaultAsync(x => x.Id == id && x.DeletedAt == null)
            ?? throw ApiException.NotFound("movie not found", "not_found");
        var now = DateTime.UtcNow;
        var statusChanging = r.Status != m.Status && r.Status != "showing" && m.Status == "showing";
        var durationChanging = r.Duration != m.Duration;
        if ((statusChanging || durationChanging) && await HasUpcomingAsync(id))
            throw ApiException.Conflict(
                "movie has upcoming showtimes; close them first", "movie_has_showtimes");
        Validate(m, r, isNew: false);
        m.UpdatedAt = now;
        await _db.SaveChangesAsync();
        return ToDto(m);
    }

    public async Task DeleteAsync(Guid id)
    {
        var m = await _db.Movies.SingleOrDefaultAsync(x => x.Id == id && x.DeletedAt == null)
            ?? throw ApiException.NotFound("movie not found", "not_found");
        if (await HasUpcomingAsync(id))
            throw ApiException.Conflict(
                "movie has upcoming showtimes; close them first", "movie_has_showtimes");
        m.DeletedAt = DateTime.UtcNow; // soft-delete keeps booking history
        await _db.SaveChangesAsync();
    }

    private Task<bool> HasUpcomingAsync(Guid movieId)
    {
        var now = DateTime.UtcNow;
        return _db.Showtimes.AnyAsync(x => x.MovieId == movieId
            && x.DeletedAt == null && x.StartAt > now && x.Status != "cancelled");
    }

    private static Movie Validate(Movie m, MovieRequest r, bool isNew)
    {
        var d = new Dictionary<string, string>();
        if (string.IsNullOrWhiteSpace(r.Title) || r.Title.Length > 255) d["title"] = "must be 1..255 chars";
        if (string.IsNullOrWhiteSpace(r.Genre) || r.Genre.Length > 100) d["genre"] = "must be 1..100 chars";
        if (r.Duration is < 1 or > 600) d["duration"] = "must be 1..600 minutes";
        if (string.IsNullOrWhiteSpace(r.Director) || r.Director.Length > 255) d["director"] = "must be 1..255 chars";
        if (r.Description is { Length: > 5000 }) d["description"] = "at most 5000 chars";
        if (r.Cast is { Length: > 2000 }) d["cast"] = "at most 2000 chars";
        foreach (var (k, v) in new[] { ("poster_url", r.PosterUrl), ("backdrop_url", r.BackdropUrl), ("trailer_url", r.TrailerUrl) })
            if (!string.IsNullOrEmpty(v) && (!Uri.TryCreate(v, UriKind.Absolute, out _) || v.Length > 512))
                d[k] = "must be an absolute URL";
        var age = string.IsNullOrEmpty(r.AgeRating) ? "P" : r.AgeRating;
        if (!AgeRatings.Contains(age)) d["age_rating"] = "must be one of P K T13 T16 T18";
        if (!Statuses.Contains(r.Status)) d["status"] = "unknown status";
        if (!DateOnly.TryParseExact(r.ReleaseDate, "yyyy-MM-dd", out var rel)) d["release_date"] = "must match format yyyy-MM-dd";
        if (d.Count > 0) throw ApiException.Validation(d);

        m.Title = r.Title.Trim(); m.Genre = r.Genre.Trim(); m.Duration = r.Duration;
        m.Director = r.Director.Trim(); m.Description = r.Description; m.PosterUrl = r.PosterUrl;
        m.BackdropUrl = r.BackdropUrl; m.TrailerUrl = r.TrailerUrl; m.CastMembers = r.Cast;
        m.AgeRating = age; m.ReleaseDate = rel; m.Status = r.Status;
        return m;
    }
}
