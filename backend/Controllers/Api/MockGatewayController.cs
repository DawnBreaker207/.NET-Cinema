using Cinema.Api.Common;
using Cinema.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Cinema.Api.Controllers.Api;

// Mock payment gateway (demo only): checkout page + 5 buttons like Go,
// server-to-server IPN over HTTP, signed 303 back to the return URL.
[AllowAnonymous]
public sealed class MockGatewayController : Controller
{
    private readonly PaymentService _pay;
    private readonly IConfiguration _cfg;
    public MockGatewayController(PaymentService pay, IConfiguration cfg) { _pay = pay; _cfg = cfg; }

    private bool Enabled => _cfg.GetValue("Payment:MockEnabled", true);

    [HttpGet("/mock-gateway/checkout")]
    public IActionResult Checkout([FromQuery] string @ref)
    {
        if (!Enabled) return NotFound();
        if (!_pay.MockGet(@ref, out _, out _, out var amount))
            return Content("unknown transaction", "text/plain");
        var html = $"""
            <html><body style="font-family:sans-serif;max-width:480px;margin:40px auto">
            <h2>Mock gateway</h2><p>Amount: <b>{amount:N0}₫</b> (ref {@ref})</p>
            <form method="post" action="/mock-gateway/pay?ref={@ref}"><button>1. Pay now (IPN)</button></form>
            <form method="post" action="/mock-gateway/no-ipn?ref={@ref}"><button>2. Pay, no IPN (reconcile)</button></form>
            <form method="post" action="/mock-gateway/wrong-amount?ref={@ref}"><button>3. Wrong amount (refund)</button></form>
            <form method="post" action="/mock-gateway/decline?ref={@ref}"><button>4. Decline card</button></form>
            <form method="post" action="/mock-gateway/cancel?ref={@ref}"><button>5. Cancel</button></form>
            </body></html>
            """;
        return Content(html, "text/html");
    }

    private string ReturnUrl(string txnRef, string status)
        => $"/api/v1/payments/mock/return?txn_ref={txnRef}&status={status}&sig={_pay.MockSignReturn(txnRef, status)}";

    [HttpPost("/mock-gateway/pay")]
    public async Task<IActionResult> Pay([FromQuery] string @ref)
    {
        if (!_pay.MockGet(@ref, out _, out _, out var amount)) return NotFound();
        await _pay.FireIpnAsync(@ref, amount, "paid");
        return Redirect(ReturnUrl(@ref, "paid"));
    }

    [HttpPost("/mock-gateway/no-ipn")]
    public IActionResult NoIpn([FromQuery] string @ref)
    {
        if (!_pay.MockGet(@ref, out _, out _, out var amount)) return NotFound();
        _pay.MockSet(@ref, "paid", amount);
        return Redirect(ReturnUrl(@ref, "paid"));
    }

    [HttpPost("/mock-gateway/wrong-amount")]
    public async Task<IActionResult> WrongAmount([FromQuery] string @ref)
    {
        if (!_pay.MockGet(@ref, out _, out _, out var amount)) return NotFound();
        await _pay.FireIpnAsync(@ref, amount - 1000, "paid");
        return Redirect(ReturnUrl(@ref, "paid"));
    }

    [HttpPost("/mock-gateway/decline")]
    public async Task<IActionResult> Decline([FromQuery] string @ref)
    {
        if (!_pay.MockGet(@ref, out _, out _, out var amount)) return NotFound();
        await _pay.FireIpnAsync(@ref, amount, "failed");
        return Redirect(ReturnUrl(@ref, "failed"));
    }

    [HttpPost("/mock-gateway/cancel")]
    public IActionResult Cancel([FromQuery] string @ref) => Redirect(ReturnUrl(@ref, "canceled"));
}
