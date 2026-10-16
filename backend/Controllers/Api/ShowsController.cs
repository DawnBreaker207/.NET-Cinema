using Cinema.Api.Common;
using Cinema.Api.Data;
using Cinema.Api.Dtos;
using Cinema.Api.Middleware;
using Cinema.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Cinema.Api.Controllers.Api;

[EnableRateLimiting("public")]
public sealed class ShowsController : ApiController
{
    private readonly ShowService _svc;
    private readonly CinemaDbContext _db;
    private readonly JwtService _jwt;
    public ShowsController(ShowService svc, CinemaDbContext db, JwtService jwt)
    { _svc = svc; _db = db; _jwt = jwt; }

    [HttpGet("/api/v1/movies/{id:guid}/showtimes")]
    [AllowAnonymous]
    public async Task<IActionResult> ForMovie(Guid id, [FromQuery] string? date)
    {
        await OptionalAuth.CurrentAsync(HttpContext, _db, _jwt);
        return OkData(await _svc.ForMovieAsync(id, date));
    }

    [HttpGet("/api/v1/showtimes")]
    [AllowAnonymous]
    public async Task<IActionResult> ByDate([FromQuery] string? date)
    {
        await OptionalAuth.CurrentAsync(HttpContext, _db, _jwt);
        return OkData(await _svc.ByDateAsync(date));
    }

    [HttpGet("/api/v1/shows/{id:guid}/seats")]
    [Authorize]
    public async Task<IActionResult> SeatMap(Guid id) => OkData(await _svc.SeatMapAsync(id));

    [HttpGet("/api/v1/admin/showtimes")]
    [Authorize(Roles = "admin,staff")]
    public async Task<IActionResult> AdminList([FromQuery] Guid? movie_id, [FromQuery] Guid? hall_id,
        [FromQuery] string? status, [FromQuery] string? date, [FromQuery] string? from, [FromQuery] string? to,
        [FromQuery] string? sort, [FromQuery] string? order, [FromQuery] string? search,
        [FromQuery] int? page = 1, [FromQuery] int? page_size = 10)
    {
        var (p, ps) = Paging(page, page_size);
        var (items, total) = await _svc.AdminListAsync(movie_id, hall_id, status, date, from, to, sort, order, search, p, ps);
        return PagedData(items, p, ps, total);
    }

    [HttpGet("/api/v1/admin/showtimes/{id:guid}")]
    [Authorize(Roles = "admin,staff")]
    public async Task<IActionResult> AdminGet(Guid id) => OkData(await _svc.AdminGetAsync(id));

    [HttpPost("/api/v1/admin/showtimes")]
    [Authorize(Roles = "admin,staff")]
    public async Task<IActionResult> Create([FromBody] ShowtimeRequest r)
        => CreatedData(await _svc.CreateAsync(r));

    [HttpPut("/api/v1/admin/showtimes/{id:guid}")]
    [Authorize(Roles = "admin,staff")]
    public async Task<IActionResult> Update(Guid id, [FromBody] ShowtimeRequest r)
        => OkData(await _svc.UpdateAsync(id, r));

    [HttpDelete("/api/v1/admin/showtimes/{id:guid}")]
    [Authorize(Roles = "admin,staff")]
    public async Task<IActionResult> Delete(Guid id)
    {
        await _svc.DeleteAsync(id);
        return OkData(new { message = "deleted" });
    }

    [HttpPost("/api/v1/admin/showtimes/{id:guid}/cancel")]
    [Authorize(Roles = "admin,staff")]
    public async Task<IActionResult> Cancel(Guid id) => OkData(await _svc.CancelAsync(id));
}
