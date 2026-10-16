using Cinema.Api.Common;
using Cinema.Api.Dtos;
using Cinema.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Cinema.Api.Controllers.Api;

public sealed class ComboController : ApiController
{
    private readonly ComboService _svc;
    public ComboController(ComboService svc) => _svc = svc;
    private Guid Uid() => Guid.Parse(User.FindFirst("uid")!.Value);

    [HttpGet("/api/v1/combos")]
    [AllowAnonymous]
    public async Task<IActionResult> List() => OkData(await _svc.ListAsync(onlyActive: true));

    [HttpPost("/api/v1/combo-orders")]
    [Authorize]
    public async Task<IActionResult> CreateOrder([FromBody] ComboOrderRequest r)
        => CreatedData(await _svc.CreateOrderAsync(Uid(), r));

    [HttpGet("/api/v1/combo-orders/me")]
    [Authorize]
    public async Task<IActionResult> Mine([FromQuery] int? page = 1, [FromQuery] int? page_size = 10)
    {
        var (p, ps) = Paging(page, page_size);
        var (items, total) = await _svc.MyOrdersAsync(Uid(), p, ps);
        return PagedData(items, p, ps, total);
    }

    [HttpGet("/api/v1/admin/concessions")]
    [Authorize(Roles = "admin,staff")]
    public async Task<IActionResult> AdminList([FromQuery] string? search, [FromQuery] bool? active,
        [FromQuery] int? page = 1, [FromQuery] int? page_size = 10)
    {
        var (p, ps) = Paging(page, page_size);
        var (items, total) = await _svc.AdminListPagedAsync(search, active, p, ps);
        return PagedData(items, p, ps, total);
    }

    [HttpGet("/api/v1/admin/concessions/{id:guid}")]
    [Authorize(Roles = "admin,staff")]
    public async Task<IActionResult> AdminGet(Guid id) => OkData(await _svc.GetAsync(id));

    [HttpPost("/api/v1/admin/concessions")]
    [Authorize(Roles = "admin,staff")]
    public async Task<IActionResult> AdminCreate([FromBody] ComboRequest r)
        => CreatedData(await _svc.CreateAsync(r));

    [HttpPatch("/api/v1/admin/concessions/{id:guid}")]
    [Authorize(Roles = "admin,staff")]
    public async Task<IActionResult> AdminUpdate(Guid id, [FromBody] ComboRequest r)
        => OkData(await _svc.UpdateAsync(id, r));

    [HttpDelete("/api/v1/admin/concessions/{id:guid}")]
    [Authorize(Roles = "admin,staff")]
    public async Task<IActionResult> AdminDelete(Guid id)
    {
        await _svc.DeleteAsync(id);
        return OkData(new { message = "deleted" });
    }

    [HttpPost("/api/v1/staff/combo-orders")]
    [Authorize(Roles = "staff,admin")]
    public async Task<IActionResult> CounterSell([FromBody] CounterComboRequest r)
        => CreatedData(await _svc.CounterSellAsync(r));

    [HttpGet("/api/v1/staff/combo-orders/pending")]
    [Authorize(Roles = "staff,admin")]
    public async Task<IActionResult> Pending([FromQuery] string? date, [FromQuery] string? search)
        => OkData(await _svc.PendingPickupsAsync(date, search));

    [HttpPost("/api/v1/staff/combo-orders/{id:guid}/collect")]
    [Authorize(Roles = "staff,admin")]
    public async Task<IActionResult> Collect(Guid id)
    {
        await _svc.CollectAsync(id);
        return OkData(new { message = "collected" });
    }
}
