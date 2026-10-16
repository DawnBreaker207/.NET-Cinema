using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Cinema.Api.Areas.Admin.Controllers;

// Catalog group: Phim / Phòng chiếu / Suất chiếu / Bắp nước tabbed under one sider
// entry, mirroring the React console (features/catalog/CatalogPage.tsx).
[Area("Admin")]
[Authorize(AuthenticationSchemes = "Web", Roles = "admin,staff")]
public sealed class CatalogController : Controller
{
    [HttpGet("/admin/catalog")]
    public IActionResult Index(string? tab)
    {
        ViewData["Tab"] = tab is "movies" or "halls" or "showtimes" or "concessions" ? tab : "movies";
        return View("/Areas/Admin/Views/Catalog/Index.cshtml");
    }
}

// Legacy per-page routes (kept so bookmarks/tests keep working): redirect into the tabs.
[Area("Admin")]
[Authorize(AuthenticationSchemes = "Web", Roles = "admin,staff")]
public sealed class CatalogRedirectsController : Controller
{
    [HttpGet("/admin/movies")] public IActionResult Movies() => Redirect("/admin/catalog?tab=movies");
    [HttpGet("/admin/halls")] public IActionResult Halls() => Redirect("/admin/catalog?tab=halls");
    [HttpGet("/admin/showtimes")] public IActionResult Showtimes() => Redirect("/admin/catalog?tab=showtimes");
    [HttpGet("/admin/combos")] public IActionResult Combos() => Redirect("/admin/catalog?tab=concessions");
}

[Area("Admin")]
[Authorize(AuthenticationSchemes = "Web", Roles = "admin")]
public sealed class OrdersController : Controller
{
    [HttpGet("/admin/orders")]
    public IActionResult Index() => Redirect("/admin/bookings");
}

[Area("Admin")]
[Authorize(AuthenticationSchemes = "Web", Roles = "admin")]
public sealed class UsersController : Controller
{
    [HttpGet("/admin/users")]
    public IActionResult Index() => View();
}

[Area("Admin")]
[Authorize(AuthenticationSchemes = "Web", Roles = "admin")]
public sealed class PromotionsController : Controller
{
    [HttpGet("/admin/promotions")]
    public IActionResult Index() => View();
}

[Area("Admin")]
[Authorize(AuthenticationSchemes = "Web", Roles = "admin")]
public sealed class PricingConsoleController : Controller
{
    [HttpGet("/admin/pricing")]
    public IActionResult Index() => View("/Areas/Admin/Views/Pricing/Index.cshtml");
}

[Area("Admin")]
[Authorize(AuthenticationSchemes = "Web", Roles = "admin")]
public sealed class MonitoringController : Controller
{
    [HttpGet("/admin/monitoring")]
    public IActionResult Index() => View();
}

[Area("Admin")]
[Authorize(AuthenticationSchemes = "Web", Roles = "admin,staff")]
public sealed class CounterController : Controller
{
    [HttpGet("/admin/counter")]
    public IActionResult Index() => View("/Areas/Admin/Views/Counter/Index.cshtml");
}

// Bookings (React: features/booking/BookingsPage + OrderDetailDrawer).
[Area("Admin")]
[Authorize(AuthenticationSchemes = "Web", Roles = "admin")]
public sealed class BookingsConsoleController : Controller
{
    [HttpGet("/admin/bookings")]
    public IActionResult Index() => View("/Areas/Admin/Views/Bookings/Index.cshtml");
}
