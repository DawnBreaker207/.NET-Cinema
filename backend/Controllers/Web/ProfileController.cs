using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Cinema.Api.Controllers.Web;

// Operator self-service (mirrors React /profile): info, password, sessions.
[Authorize(AuthenticationSchemes = "Web", Roles = "admin,staff")]
public sealed class ProfileController : Controller
{
    [HttpGet("/account/profile")]
    public IActionResult Index() => View();
}
