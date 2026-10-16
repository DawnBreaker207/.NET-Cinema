using Cinema.Api.Common;
using Cinema.Api.Dtos;
using Cinema.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Cinema.Api.Controllers.Api;

public sealed class TicketsController : ApiController
{
    private readonly BookingService _svc;
    public TicketsController(BookingService svc) => _svc = svc;

    [HttpPost("/api/v1/tickets/{id}/redeem")]
    [Authorize(Roles = "staff,admin")]
    public async Task<IActionResult> Redeem(string id, [FromBody] RedeemRequest r)
        => OkData(await _svc.RedeemAsync(id, r.ShowtimeId));

    [HttpGet("/api/v1/tickets/{id}/qr")]
    [Authorize]
    public async Task<IActionResult> Qr(string id)
        => OkData(await _svc.TicketQrAsync(
            Guid.Parse(User.FindFirst("uid")!.Value), id,
            User.FindFirst("db_role")?.Value ?? User.FindFirst("role")?.Value ?? "customer"));
}
