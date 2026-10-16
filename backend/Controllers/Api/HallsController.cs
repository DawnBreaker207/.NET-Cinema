using Cinema.Api.Common;
using Cinema.Api.Dtos;
using Cinema.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Cinema.Api.Controllers.Api;

[Authorize(Roles = "admin,staff")]
public sealed class HallsController : ApiController
{
    private readonly HallService _svc;
    public HallsController(HallService svc) => _svc = svc;

    [HttpGet("/api/v1/admin/hall-templates")]
    public IActionResult Templates() => OkData(_svc.Templates());

    [HttpGet("/api/v1/admin/halls")]
    public async Task<IActionResult> List([FromQuery] string? search,
        [FromQuery] int? page = 1, [FromQuery] int? page_size = 10)
    {
        var (p, ps) = Paging(page, page_size);
        var (items, total) = await _svc.ListPagedAsync(search, p, ps);
        return PagedData(items, p, ps, total);
    }

    [HttpGet("/api/v1/admin/halls/{id:guid}")]
    public async Task<IActionResult> Show(Guid id) => OkData(await _svc.GetAsync(id));

    [HttpGet("/api/v1/admin/halls/{id:guid}/seats")]
    [HttpGet("/api/v1/halls/{id:guid}/seats")]
    [AllowAnonymous]
    public async Task<IActionResult> Seats(Guid id) => OkData(await _svc.SeatsAsync(id));

    [HttpPost("/api/v1/admin/halls")]
    public async Task<IActionResult> Create([FromBody] HallRequest r)
        => CreatedData(await _svc.CreateAsync(r));

    [HttpPost("/api/v1/admin/halls/{id:guid}/clone")]
    public async Task<IActionResult> Clone(Guid id, [FromBody] CloneHallRequest r)
        => CreatedData(await _svc.CloneAsync(id, r));

    [HttpPut("/api/v1/admin/halls/{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateHallRequest r)
        => OkData(await _svc.UpdateAsync(id, r));

    [HttpPut("/api/v1/admin/halls/{id:guid}/layout")]
    public async Task<IActionResult> Regenerate(Guid id, [FromBody] HallRequest r)
        => OkData(await _svc.RegenerateAsync(id, r));

    [HttpDelete("/api/v1/admin/halls/{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        await _svc.DeleteAsync(id);
        return OkData(new { message = "deleted" });
    }

    [HttpPatch("/api/v1/admin/halls/{id:guid}/seats")]
    public async Task<IActionResult> BulkUpdate(Guid id, [FromBody] BulkSeatUpdateRequest r)
    {
        await _svc.BulkUpdateAsync(id, r);
        return OkData(new { message = "updated" });
    }

    [HttpPut("/api/v1/admin/halls/{id:guid}/seats/{seatId:guid}")]
    [HttpPut("/api/v1/halls/{id:guid}/seats/{seatId:guid}")]
    public async Task<IActionResult> UpdateSeat(Guid id, Guid seatId, [FromBody] SeatUpdateRequest r)
        => OkData(await _svc.UpdateSeatAsync(id, seatId, r));

    [HttpPost("/api/v1/admin/halls/{id:guid}/seats")]
    public async Task<IActionResult> AddSeat(Guid id, [FromBody] AddSeatRequest r)
        => CreatedData(await _svc.AddSeatAsync(id, r));

    [HttpPost("/api/v1/admin/halls/{id:guid}/seats/rows")]
    public async Task<IActionResult> AddRow(Guid id)
    {
        await _svc.AddRowAsync(id);
        return OkData(new { message = "row added" });
    }

    [HttpDelete("/api/v1/admin/halls/{id:guid}/seats/rows/{rowLabel}")]
    public async Task<IActionResult> DeleteRow(Guid id, string rowLabel)
    {
        await _svc.DeleteRowAsync(id, rowLabel);
        return OkData(new { message = "row deleted" });
    }

    [HttpPost("/api/v1/admin/halls/{id:guid}/seats/columns")]
    public async Task<IActionResult> AddColumn(Guid id)
    {
        await _svc.AddColumnAsync(id);
        return OkData(new { message = "column added" });
    }

    [HttpPost("/api/v1/admin/halls/{id:guid}/seats/merge")]
    public async Task<IActionResult> Merge(Guid id, [FromBody] MergeSeatsRequest r)
        => OkData(await _svc.MergeAsync(id, r));

    [HttpPost("/api/v1/admin/halls/{id:guid}/seats/split")]
    public async Task<IActionResult> Split(Guid id, [FromBody] SplitSeatRequest r)
        => OkData(await _svc.SplitAsync(id, r));
}
