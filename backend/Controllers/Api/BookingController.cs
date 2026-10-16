using Cinema.Api.Common;
using Cinema.Api.Dtos;
using Cinema.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Cinema.Api.Controllers.Api;

[Route("api/v1/orders")]
public sealed class BookingController : ApiController
{
    private readonly BookingService _svc;
    private readonly PaymentService _pay;
    public BookingController(BookingService svc, PaymentService pay) { _svc = svc; _pay = pay; }
    private Guid Uid() => Guid.Parse(User.FindFirst("uid")!.Value);

    [HttpGet("")]
    [Authorize]
    public async Task<IActionResult> List([FromQuery] int? page = 1, [FromQuery] int? page_size = 10)
    {
        var (p, ps) = Paging(page, page_size);
        var (items, total) = await _svc.ListAsync(Uid(), p, ps);
        return PagedData(items, p, ps, total);
    }

    [HttpPost("hold")]
    [Authorize(Roles = "customer")]
    [EnableRateLimiting("hold")]
    public async Task<IActionResult> Hold([FromBody] HoldRequest r)
        => CreatedData(await _svc.HoldAsync(Uid(), r));

    [HttpPost("init")]
    [Authorize(Roles = "customer")]
    [EnableRateLimiting("hold")]
    public async Task<IActionResult> Init([FromBody] InitRequest r)
        => OkData(await _svc.InitAsync(Uid(), r.ShowId));

    [HttpPost("{id:guid}/refresh")]
    [Authorize(Roles = "customer")]
    [EnableRateLimiting("hold")]
    public async Task<IActionResult> Refresh(Guid id) => OkData(await _svc.RefreshAsync(Uid(), id));

    [HttpPost("{id:guid}/cancel")]
    [Authorize(Roles = "customer")]
    public async Task<IActionResult> Cancel(Guid id)
    {
        await _svc.CancelAsync(Uid(), id);
        return OkData(new { message = "canceled" });
    }

    [HttpPost("{id:guid}/discount")]
    [Authorize(Roles = "customer")]
    public async Task<IActionResult> ApplyDiscount(Guid id, [FromBody] ApplyDiscountRequest r)
        => OkData(await _svc.ApplyDiscountAsync(Uid(), id, r.Code));

    [HttpDelete("{id:guid}/discount")]
    [Authorize(Roles = "customer")]
    public async Task<IActionResult> RemoveDiscount(Guid id)
        => OkData(await _svc.RemoveDiscountAsync(Uid(), id));

    [HttpGet("{id:guid}")]
    [HttpGet("{id:guid}/tickets")]
    [Authorize(Roles = "customer")]
    public async Task<IActionResult> Detail(Guid id) => OkData(await _svc.DetailAsync(Uid(), id));

    [HttpPost("{id:guid}/pay")]
    [Authorize(Roles = "customer")]
    public async Task<IActionResult> Pay(Guid id, [FromBody] PayRequest? r)
        => OkData(await _pay.PayAsync(Uid(), id, r?.Provider));

    [HttpGet("{id:guid}/status")]
    [Authorize(Roles = "customer")]
    public async Task<IActionResult> Status(Guid id)
        => OkData(await _pay.ReconcileAsync(Uid(), id));

    [HttpPost("{id:guid}/confirm")]
    [Authorize(Roles = "customer")]
    public async Task<IActionResult> Confirm(Guid id)
        => OkData(await _pay.ReconcileAsync(Uid(), id));
}
