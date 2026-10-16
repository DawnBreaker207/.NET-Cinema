using Cinema.Api.Common;
using Cinema.Api.Dtos;
using Cinema.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Cinema.Api.Controllers.Api;

public sealed class PricingController : ApiController
{
    private readonly PricingService _svc;
    public PricingController(PricingService svc) => _svc = svc;

    [HttpGet("/api/v1/pricing")]
    [AllowAnonymous]
    public async Task<IActionResult> Public() => OkData(await _svc.PublicPricesAsync());

    [HttpGet("/api/v1/pricing/quote")]
    [AllowAnonymous]
    public async Task<IActionResult> Quote([FromQuery] Guid showtime_id)
        => OkData(await _svc.QuoteAsync(showtime_id));

    [HttpGet("/api/v1/admin/pricing/base")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> GetBase() => OkData(await _svc.AdminGetBaseAsync());

    [HttpPut("/api/v1/admin/pricing/base")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> SetBase([FromBody] BasePriceRequest r)
        => OkData(await _svc.AdminSetBaseAsync(r.Prices));

    [HttpGet("/api/v1/admin/pricing/rules")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Rules([FromQuery] string? search,
        [FromQuery] int? page = 1, [FromQuery] int? page_size = 10)
    {
        var (p, ps) = Paging(page, page_size);
        var (items, total) = await _svc.RulesAsync(search, p, ps);
        return PagedData(items, p, ps, total);
    }

    [HttpGet("/api/v1/admin/pricing/rules/{id:guid}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> RuleGet(Guid id) => OkData(await _svc.RuleGetAsync(id));

    [HttpPost("/api/v1/admin/pricing/rules")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> RuleCreate([FromBody] PricingRuleRequest r)
        => CreatedData(await _svc.RuleCreateAsync(r));

    [HttpPatch("/api/v1/admin/pricing/rules/{id:guid}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> RuleUpdate(Guid id, [FromBody] PricingRuleRequest r)
        => OkData(await _svc.RuleUpdateAsync(id, r));

    [HttpDelete("/api/v1/admin/pricing/rules/{id:guid}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> RuleDelete(Guid id)
    {
        await _svc.RuleDeleteAsync(id);
        return OkData(new { message = "deleted" });
    }
}
