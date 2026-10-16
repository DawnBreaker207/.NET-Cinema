using Cinema.Api.Common;
using Cinema.Api.Dtos;
using Cinema.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Cinema.Api.Controllers.Api;

[Authorize(Roles = "staff,admin")]
public sealed class StaffController : ApiController
{
    private readonly StaffService _svc;
    public StaffController(StaffService svc) => _svc = svc;
    private Guid Uid() => Guid.Parse(User.FindFirst("uid")!.Value);

    [HttpGet("/api/v1/staff/dashboard")]
    public async Task<IActionResult> Dashboard([FromQuery] string? date)
        => OkData(await _svc.DashboardAsync(date));

    [HttpGet("/api/v1/staff/overview")]
    public async Task<IActionResult> Overview([FromQuery] string? date) => OkData(await _svc.OverviewAsync(date));

    [HttpGet("/api/v1/staff/boxoffice/day")]
    public async Task<IActionResult> BoxOfficeDay([FromQuery] string? date)
        => OkData(await _svc.BoxOfficeDayAsync(date));

    [HttpGet("/api/v1/staff/boxoffice/movies")]
    public async Task<IActionResult> CounterMovies([FromQuery] string? date)
        => OkData(await _svc.CounterMoviesAsync(date));

    [HttpPost("/api/v1/staff/orders")]
    public async Task<IActionResult> CounterSell([FromBody] CounterSellRequest r)
        => CreatedData(await _svc.CounterSellAsync(Uid(), r));

    [HttpGet("/api/v1/staff/orders/{id:guid}")]
    public async Task<IActionResult> OrderDetail(Guid id) => OkData(await _svc.OrderDetailAsync(id));

    [HttpPost("/api/v1/staff/orders/{id:guid}/collect")]
    public async Task<IActionResult> Collect(Guid id)
    {
        await _svc.CollectAsync(id);
        return OkData(new { message = "collected" });
    }

    [HttpGet("/api/v1/staff/tickets/{code}/order")]
    public async Task<IActionResult> OrderByTicket(string code)
        => OkData(await _svc.OrderByTicketAsync(code));

    [HttpGet("/api/v1/staff/showtimes/{id:guid}/tickets")]
    public async Task<IActionResult> ShowTickets(Guid id, [FromQuery] string? status)
        => OkData(await _svc.ShowTicketsAsync(id, status));

    [HttpGet("/api/v1/staff/customers")]
    public async Task<IActionResult> Customers([FromQuery] string? search,
        [FromQuery] int? page = 1, [FromQuery] int? page_size = 10)
    {
        var (p, ps) = Paging(page, page_size);
        return OkData(await _svc.SearchCustomersAsync(search, p, ps));
    }

    [HttpGet("/api/v1/staff/customers/{id:guid}")]
    public async Task<IActionResult> Customer(Guid id) => OkData(await _svc.CustomerProfileAsync(id));

    [HttpGet("/api/v1/staff/customers/{id:guid}/orders")]
    public async Task<IActionResult> CustomerOrders(Guid id,
        [FromQuery] int? page = 1, [FromQuery] int? page_size = 10)
    {
        var (p, ps) = Paging(page, page_size);
        return OkData(await _svc.CustomerOrdersAsync(id, p, ps));
    }
}
