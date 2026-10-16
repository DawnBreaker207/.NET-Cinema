using Cinema.Api.Common;
using Cinema.Api.Data;
using Cinema.Api.Dtos;
using Cinema.Api.Middleware;
using Cinema.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Cinema.Api.Controllers.Api;

[Route("api/v1/users")]
public sealed class UsersController : ApiController
{
    private readonly AuthService _svc;
    private readonly BookingService _bookings;
    private readonly CinemaDbContext _db;
    private readonly JwtService _jwt;
    public UsersController(AuthService svc, BookingService bookings, CinemaDbContext db, JwtService jwt)
    { _svc = svc; _bookings = bookings; _db = db; _jwt = jwt; }

    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> Me() => OkData(await _svc.MeAsync(Uid()));

    [HttpPut("me")]
    [Authorize]
    public async Task<IActionResult> UpdateMe([FromBody] UpdateMeRequest r)
        => OkData(await _svc.UpdateMeAsync(Uid(), r));

    [HttpDelete("me")]
    [Authorize(Roles = "customer")]
    public async Task<IActionResult> DeleteMe([FromBody] DeleteMeRequest r)
    {
        await _svc.DeleteMeAsync(Uid(), r.Password);
        return OkData(new { message = "account deleted" });
    }

    [HttpGet("me/notification-preferences")]
    [Authorize]
    public async Task<IActionResult> GetPrefs() => OkData(await _svc.GetPrefsAsync(Uid()));

    [HttpPut("me/notification-preferences")]
    [Authorize]
    public async Task<IActionResult> UpdatePrefs([FromBody] UpdatePrefsRequest r)
        => OkData(await _svc.UpdatePrefsAsync(Uid(), r));

    [HttpGet("me/transactions")]
    [Authorize]
    public async Task<IActionResult> Transactions() => OkData(await _bookings.TransactionsAsync(Uid()));

    private Guid Uid() => Guid.Parse(User.FindFirst("uid")!.Value);
}
