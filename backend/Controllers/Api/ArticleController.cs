using Cinema.Api.Common;
using Cinema.Api.Dtos;
using Cinema.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Cinema.Api.Controllers.Api;

public sealed class ArticleController : ApiController
{
    private readonly ArticleService _svc;
    public ArticleController(ArticleService svc) => _svc = svc;
    private Guid Uid() => Guid.Parse(User.FindFirst("uid")!.Value);

    [HttpGet("/api/v1/articles")]
    [AllowAnonymous]
    public async Task<IActionResult> List([FromQuery] int? page = 1, [FromQuery] int? page_size = 10)
    {
        var (p, ps) = Paging(page, page_size);
        var (items, total) = await _svc.PublicListAsync(p, ps);
        return PagedData(items, p, ps, total);
    }

    [HttpGet("/api/v1/articles/{slug}")]
    [AllowAnonymous]
    public async Task<IActionResult> Show(string slug) => OkData(await _svc.PublicGetAsync(slug));

    [HttpGet("/api/v1/admin/articles")]
    [Authorize(Roles = "admin,staff")]
    public async Task<IActionResult> AdminList([FromQuery] int? page = 1, [FromQuery] int? page_size = 10,
        [FromQuery] string? type = null)
    {
        var (p, ps) = Paging(page, page_size);
        var (items, total) = await _svc.AdminListAsync(p, ps, type);
        return PagedData(items, p, ps, total);
    }

    [HttpGet("/api/v1/admin/articles/{id:guid}")]
    [Authorize(Roles = "admin,staff")]
    public async Task<IActionResult> AdminGet(Guid id) => OkData(await _svc.AdminGetAsync(id));

    [HttpPost("/api/v1/admin/articles")]
    [Authorize(Roles = "admin,staff")]
    public async Task<IActionResult> Create([FromBody] ArticleRequest r)
        => CreatedData(await _svc.CreateAsync(Uid(), r));

    [HttpPut("/api/v1/admin/articles/{id:guid}")]
    [Authorize(Roles = "admin,staff")]
    public async Task<IActionResult> Update(Guid id, [FromBody] ArticleRequest r)
        => OkData(await _svc.UpdateAsync(id, r));

    [HttpDelete("/api/v1/admin/articles/{id:guid}")]
    [Authorize(Roles = "admin,staff")]
    public async Task<IActionResult> Delete(Guid id)
    {
        await _svc.DeleteAsync(id);
        return OkData(new { message = "deleted" });
    }
}
