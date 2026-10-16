using Cinema.Api.Common;
using Cinema.Api.Dtos;
using Cinema.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Cinema.Api.Controllers.Api;

public sealed class CampaignController : ApiController
{
    private readonly CampaignService _svc;
    public CampaignController(CampaignService svc) => _svc = svc;

    [HttpGet("/api/v1/campaigns")]
    [AllowAnonymous]
    public async Task<IActionResult> PublicList([FromQuery] int? page = 1, [FromQuery] int? page_size = 10)
    {
        var (p, ps) = Paging(page, page_size);
        var (items, total) = await _svc.PublicListAsync(p, ps);
        return PagedData(items, p, ps, total);
    }

    [HttpGet("/api/v1/campaigns/{id:guid}")]
    [AllowAnonymous]
    public async Task<IActionResult> PublicGet(Guid id) => OkData(await _svc.PublicGetAsync(id));

    [HttpGet("/api/v1/admin/campaigns")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> AdminList([FromQuery] string? search, [FromQuery] bool? active,
        [FromQuery] int? page = 1, [FromQuery] int? page_size = 10)
    {
        var (p, ps) = Paging(page, page_size);
        var (items, total) = await _svc.AdminListAsync(search, active, p, ps);
        return PagedData(items, p, ps, total);
    }

    [HttpGet("/api/v1/admin/campaigns/{id:guid}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> AdminGet(Guid id) => OkData(await _svc.AdminGetAsync(id));

    [HttpPost("/api/v1/admin/campaigns")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Create([FromBody] CampaignRequest r)
        => CreatedData(await _svc.CreateAsync(r));

    [HttpPatch("/api/v1/admin/campaigns/{id:guid}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Update(Guid id, [FromBody] CampaignRequest r)
        => OkData(await _svc.UpdateAsync(id, r));

    [HttpDelete("/api/v1/admin/campaigns/{id:guid}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Delete(Guid id)
    {
        await _svc.DeleteAsync(id);
        return OkData(new { message = "deleted" });
    }

    [HttpPost("/api/v1/admin/campaigns/{id:guid}/combos/{comboId:guid}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> AttachCombo(Guid id, Guid comboId, [FromQuery(Name = "promo_price")] int? promoPrice)
    {
        await _svc.AttachComboAsync(id, comboId, promoPrice);
        return OkData(new { message = "attached" });
    }

    [HttpDelete("/api/v1/admin/campaigns/{id:guid}/combos/{comboId:guid}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> DetachCombo(Guid id, Guid comboId)
    {
        await _svc.DetachComboAsync(id, comboId);
        return OkData(new { message = "detached" });
    }

    [HttpPost("/api/v1/admin/campaigns/{id:guid}/articles/{articleId:guid}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> AttachArticle(Guid id, Guid articleId)
    {
        await _svc.AttachArticleAsync(id, articleId);
        return OkData(new { message = "attached" });
    }

    [HttpDelete("/api/v1/admin/campaigns/{id:guid}/articles/{articleId:guid}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> DetachArticle(Guid id, Guid articleId)
    {
        await _svc.DetachArticleAsync(id, articleId);
        return OkData(new { message = "detached" });
    }

    [HttpPost("/api/v1/admin/campaigns/{id:guid}/discount-codes/{codeId:guid}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> AttachDiscount(Guid id, Guid codeId)
    {
        await _svc.AttachDiscountAsync(id, codeId);
        return OkData(new { message = "attached" });
    }

    [HttpDelete("/api/v1/admin/campaigns/{id:guid}/discount-codes/{codeId:guid}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> DetachDiscount(Guid id, Guid codeId)
    {
        await _svc.DetachDiscountAsync(id, codeId);
        return OkData(new { message = "detached" });
    }
}

[Authorize(Roles = "admin")]
public sealed class DiscountController : ApiController
{
    private readonly CampaignService _svc;
    public DiscountController(CampaignService svc) => _svc = svc;

    [HttpGet("/api/v1/admin/discounts")]
    public async Task<IActionResult> List([FromQuery] string? search, [FromQuery] bool? active,
        [FromQuery] int? page = 1, [FromQuery] int? page_size = 10)
    {
        var (p, ps) = Paging(page, page_size);
        var (items, total) = await _svc.DiscountListAsync(search, active, p, ps);
        return PagedData(items, p, ps, total);
    }

    [HttpGet("/api/v1/admin/discounts/{id:guid}")]
    public async Task<IActionResult> Get(Guid id) => OkData(await _svc.DiscountGetAsync(id));

    [HttpPost("/api/v1/admin/discounts")]
    public async Task<IActionResult> Create([FromBody] DiscountRequest r)
        => CreatedData(await _svc.DiscountCreateAsync(r));

    [HttpPatch("/api/v1/admin/discounts/{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] DiscountRequest r)
        => OkData(await _svc.DiscountUpdateAsync(id, r));

    [HttpDelete("/api/v1/admin/discounts/{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        await _svc.DiscountDeleteAsync(id);
        return OkData(new { message = "deleted" });
    }
}
