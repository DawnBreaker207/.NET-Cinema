using Cinema.Api.Common;
using Cinema.Api.Dtos;
using Cinema.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Cinema.Api.Controllers.Api;

[Route("api/v1/auth")]
[EnableRateLimiting("auth")]
public sealed class AuthController : ApiController
{
    private readonly AuthService _svc;
    public AuthController(AuthService svc) => _svc = svc;

    private static string Ip(HttpContext c) =>
        c.Request.Headers["X-Forwarded-For"].FirstOrDefault()?.Split(',')[0].Trim()
        ?? c.Connection.RemoteIpAddress?.ToString() ?? "";

    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<IActionResult> Register([FromBody] RegisterRequest r)
        => CreatedData(await _svc.RegisterAsync(r));

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login([FromBody] LoginRequest r)
        => OkData(await _svc.LoginAsync(r, Ip(HttpContext),
            HttpContext.Request.Headers.UserAgent.ToString()));

    [HttpPost("terms-accept")]
    [Authorize]
    public async Task<IActionResult> AcceptTerms()
    {
        await _svc.AcceptTermsAsync(Guid.Parse(User.FindFirst("uid")!.Value));
        return OkData(new { accepted = true });
    }

    [HttpPost("refresh")]
    [AllowAnonymous]
    public async Task<IActionResult> Refresh([FromBody] RefreshRequest r)
        => OkData(await _svc.RefreshAsync(r.RefreshToken,
            HttpContext.Request.Headers.UserAgent.ToString()));

    [HttpPost("logout")]
    [AllowAnonymous]
    public async Task<IActionResult> Logout([FromBody] LogoutRequest r)
    {
        await _svc.LogoutAsync(r.RefreshToken);
        return OkData(new { message = "logged out" });
    }

    [HttpPost("forgot-password")]
    [AllowAnonymous]
    public async Task<IActionResult> Forgot([FromBody] ForgotPasswordRequest r)
    {
        await _svc.ForgotAsync(r.Email);
        return OkData(new { message = "if the email exists, a reset link was sent" });
    }

    [HttpPost("reset-password")]
    [AllowAnonymous]
    public async Task<IActionResult> Reset([FromBody] ResetPasswordRequest r)
    {
        await _svc.ResetAsync(r);
        return OkData(new { message = "password has been reset" });
    }

    [HttpPut("/api/v1/users/me/password")]
    [Authorize]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest r)
        => OkData(await _svc.ChangePasswordAsync(Uid(), r));

    [HttpGet("/api/v1/users/me/sessions")]
    [Authorize]
    public async Task<IActionResult> Sessions([FromQuery] string? device_id)
        => OkData(await _svc.SessionsAsync(Uid(), device_id));

    [HttpDelete("/api/v1/users/me/sessions/{id:guid}")]
    [Authorize]
    public async Task<IActionResult> RevokeSession(Guid id)
    {
        await _svc.RevokeSessionAsync(Uid(), id);
        return OkData(new { message = "session revoked" });
    }

    private Guid Uid() => Guid.Parse(User.FindFirst("uid")!.Value);
}
