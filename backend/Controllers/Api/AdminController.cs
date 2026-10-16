using Cinema.Api.Common;
using Cinema.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Cinema.Api.Controllers.Api;

[Authorize(Roles = "admin")]
public sealed class AdminController : ApiController
{
    private readonly AdminService _svc;
    private readonly BatchJobs _jobs;
    public AdminController(AdminService svc, BatchJobs jobs) { _svc = svc; _jobs = jobs; }
    private Guid Uid() => Guid.Parse(User.FindFirst("uid")!.Value);

    [HttpGet("/api/v1/admin/users")]
    public async Task<IActionResult> Users([FromQuery] string? role, [FromQuery] bool? active,
        [FromQuery] string? search, [FromQuery] int? page = 1, [FromQuery] int? page_size = 10)
    {
        var (p, ps) = Paging(page, page_size);
        return OkData(await _svc.ListUsersAsync(role, active, search, p, ps));
    }

    [HttpPost("/api/v1/admin/users")]
    public async Task<IActionResult> CreateUser([FromBody] AdminService.CreateUserRequest r)
        => CreatedData(await _svc.CreateUserAsync(r));

    [HttpPatch("/api/v1/admin/users/{id:guid}")]
    [HttpPut("/api/v1/admin/users/{id:guid}")]
    public async Task<IActionResult> UpdateUser(Guid id, [FromBody] AdminService.UpdateUserRequest r)
        => OkData(await _svc.UpdateUserAsync(Uid(), id, r));

    [HttpGet("/api/v1/admin/reports/daily")]
    public async Task<IActionResult> Daily([FromQuery] string? from, [FromQuery] string? to)
        => OkData(await _svc.DailyAsync(from, to));

    [HttpGet("/api/v1/admin/reports/breakdown")]
    public async Task<IActionResult> Breakdown([FromQuery] string? from, [FromQuery] string? to)
        => OkData(await _svc.BreakdownAsync(from, to));

    [HttpGet("/api/v1/admin/overview")]
    public async Task<IActionResult> Overview() => OkData(await _svc.OverviewAsync());

    [HttpGet("/api/v1/admin/stats")]
    public async Task<IActionResult> Stats() => OkData(await _svc.StatsAsync());

    [HttpGet("/api/v1/admin/batch/jobs")]
    public async Task<IActionResult> Jobs([FromQuery] string? search,
        [FromQuery] int? page = 1, [FromQuery] int? page_size = 10)
    {
        var (p, ps) = Paging(page, page_size);
        var (items, total) = await _svc.BatchListAsync(search, p, ps);
        return PagedData(items, p, ps, total);
    }

    [HttpPost("/api/v1/admin/batch/jobs/{name}/run")]
    public async Task<IActionResult> RunJob(string name)
    {
        await _jobs.RunAsync(name, "manual");
        return StatusCode(202, new ApiBody<object>(0, "accepted", new { job = name }, null, null));
    }

    [HttpGet("/api/v1/admin/audit-logs")]
    public async Task<IActionResult> Audit([FromQuery] string? action, [FromQuery] string? resource_type,
        [FromQuery] string? resource_id, [FromQuery] string? booking_id, [FromQuery] string? actor_id,
        [FromQuery] string? outcome, [FromQuery] string? from, [FromQuery] string? to,
        [FromQuery] int? page = 1, [FromQuery] int? page_size = 20)
    {
        var (p, ps) = Paging(page, page_size, 200);
        return OkData(await _svc.AuditListAsync(action, resource_type, resource_id, booking_id,
            actor_id, outcome, from, to, p, ps));
    }

    [HttpGet("/api/v1/admin/orders")]
    public async Task<IActionResult> Orders([FromQuery] string? status, [FromQuery] string? payment_status,
        [FromQuery] string? sold_via, [FromQuery] Guid? showtime_id, [FromQuery] Guid? movie_id,
        [FromQuery] Guid? user_id, [FromQuery] string? search, [FromQuery] string? date,
        [FromQuery] string? from, [FromQuery] string? to, [FromQuery] string? sort, [FromQuery] string? order,
        [FromQuery] int? page = 1, [FromQuery] int? page_size = 10)
    {
        var (p, ps) = Paging(page, page_size);
        return OkData(await _svc.OrderListAsync(status, payment_status, sold_via,
            showtime_id, movie_id, user_id, search, date, from, to, sort, order, p, ps));
    }
}
