using Cinema.Api.Common;
using Cinema.Api.Data;
using Cinema.Api.Dtos;
using Cinema.Api.Middleware;
using Cinema.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Cinema.Api.Controllers.Api;

[Route("api/v1/movies")]
[EnableRateLimiting("public")]
public sealed class MoviesController : ApiController
{
    private readonly CatalogService _svc;
    private readonly CinemaDbContext _db;
    private readonly JwtService _jwt;
    public MoviesController(CatalogService svc, CinemaDbContext db, JwtService jwt)
    { _svc = svc; _db = db; _jwt = jwt; }

    private async Task<bool> IsOperatorAsync()
    {
        var u = await OptionalAuth.CurrentAsync(HttpContext, _db, _jwt);
        return u is not null && u.Role is "admin" or "staff";
    }

    [HttpGet("")]
    [AllowAnonymous]
    public async Task<IActionResult> List(
        [FromQuery] string? status, [FromQuery] string? genre, [FromQuery] string? search,
        [FromQuery] string sort = "created_at", [FromQuery] string order = "desc",
        [FromQuery] int? page = 1, [FromQuery] int? page_size = 10)
    {
        var op = await IsOperatorAsync();
        var (p, ps) = Paging(page, page_size);
        var (items, total) = await _svc.ListAsync(status, genre, search, sort, order, p, ps, op);
        return PagedData(items, p, ps, total);
    }

    [HttpGet("{id:guid}")]
    [AllowAnonymous]
    public async Task<IActionResult> Detail(Guid id)
        => OkData(await _svc.GetAsync(id, await IsOperatorAsync()));

    [HttpPost("")]
    [Authorize(Roles = "admin,staff")]
    public async Task<IActionResult> Create([FromBody] MovieRequest r)
        => CreatedData(await _svc.CreateAsync(r));

    [HttpPut("{id:guid}")]
    [Authorize(Roles = "admin,staff")]
    public async Task<IActionResult> Update(Guid id, [FromBody] MovieRequest r)
        => OkData(await _svc.UpdateAsync(id, r));

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = "admin,staff")]
    public async Task<IActionResult> Delete(Guid id)
    {
        await _svc.DeleteAsync(id);
        return OkData(new { message = "deleted" });
    }
}
