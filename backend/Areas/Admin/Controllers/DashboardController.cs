using Cinema.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Cinema.Api.Areas.Admin.Controllers;

[Area("Admin")]
[Route("admin")]
[Authorize(AuthenticationSchemes = "Web", Roles = "admin,staff")]
public sealed class DashboardController : Controller
{
    private readonly CinemaDbContext _db;
    public DashboardController(CinemaDbContext db) => _db = db;

    [HttpGet("")]
    public async Task<IActionResult> Index()
    {
        var today = DateTime.UtcNow.Date;
        ViewBag.MoviesShowing = await _db.Movies.CountAsync(x => x.Status == "showing" && x.DeletedAt == null);
        ViewBag.ShowtimesToday = await _db.Showtimes.CountAsync(x =>
            x.StartAt >= today && x.StartAt < today.AddDays(1) && x.DeletedAt == null);
        ViewBag.PendingOrders = await _db.Bookings.CountAsync(x => x.Status == "pending");
        ViewBag.RevenueToday = await _db.Bookings
            .Where(x => x.Status == "confirmed" && x.PaidAt >= today)
            .SumAsync(x => (long?)(x.TotalAmount - x.DiscountAmount)) ?? 0;
        return View();
    }
}
