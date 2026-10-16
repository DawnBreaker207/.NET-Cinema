using Cinema.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Cinema.Api.Controllers.Api;

[AllowAnonymous]
public sealed class HealthController : ControllerBase
{
    [HttpGet("/health")]
    [HttpGet("/healthz")]
    [HttpGet("/api/v1/health")]
    [HttpGet("/api/v1/healthz")]
    public async Task<IActionResult> Check([FromServices] CinemaDbContext db)
    {
        try
        {
            await db.Database.ExecuteSqlRawAsync("SELECT 1");
            return Ok(new { status = "ok" });
        }
        catch
        {
            return StatusCode(503, new { status = "unavailable" });
        }
    }
}
