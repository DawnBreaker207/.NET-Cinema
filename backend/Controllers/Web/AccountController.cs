using System.Security.Claims;
using Cinema.Api.Dtos;
using Cinema.Api.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Cinema.Api.Controllers.Web;

// Server-rendered login (Laravel web.php admin/login equivalent).
// Reuses the SAME AuthService as the JSON API: lockout + bcrypt + active checks.
public sealed class AccountController : Controller
{
    private readonly AuthService _svc;
    public AccountController(AuthService svc) => _svc = svc;

    [HttpGet("/account/login")]
    [AllowAnonymous]
    public IActionResult Login(string? returnUrl = null)
    {
        if (User.Identity?.IsAuthenticated == true) return Redirect(returnUrl ?? "/admin");
        ViewBag.ReturnUrl = returnUrl;
        return View();
    }

    [HttpPost("/account/login")]
    [AllowAnonymous]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> LoginPost(string email, string password, string? returnUrl = null, string? deviceId = null)
    {
        try
        {
            var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "";
            var res = await _svc.LoginAsync(new LoginRequest(email, password, deviceId ?? "web"),
                ip, Request.Headers.UserAgent.ToString());
            if (res.User.Role == "customer")
            {
                ModelState.AddModelError("", "Web console is for staff/admin.");
                ViewBag.Email = email;
                return View("Login");
            }
            var claims = new[]
            {
                new Claim("uid", res.User.Id.ToString()),
                new Claim(ClaimTypes.Name, res.User.Email),
                new Claim(ClaimTypes.Role, res.User.Role),
                new Claim("role", res.User.Role),
            };
            await HttpContext.SignInAsync("Web",
                new ClaimsPrincipal(new ClaimsIdentity(claims, "Web")),
                new AuthenticationProperties { IsPersistent = true });
            return Redirect(returnUrl ?? "/admin");
        }
        catch (Common.ApiException ex)
        {
            ModelState.AddModelError("", ex.Message);
            ViewBag.Email = email;
            return View("Login");
        }
    }

    // One-click language toggle (HeaderPrefs flag button in the React console).
    [HttpGet("/account/lang")]
    [AllowAnonymous]
    public IActionResult SetLang(string? l = null, string? returnUrl = null)
    {
        Response.Cookies.Append("cp.lang", l == "en" ? "en" : "vi", new CookieOptions
        {
            Path = "/",
            MaxAge = TimeSpan.FromDays(365),
            SameSite = SameSiteMode.Lax,
        });
        return Redirect(returnUrl ?? "/admin");
    }

    [HttpGet("/account/logout")]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync("Web");
        return Redirect("/account/login");
    }

    [HttpGet("/account/denied")]
    [AllowAnonymous]
    public IActionResult Denied() => View();
}
