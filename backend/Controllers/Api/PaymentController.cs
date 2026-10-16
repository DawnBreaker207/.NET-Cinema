using Cinema.Api.Common;
using Cinema.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Cinema.Api.Controllers.Api;

public sealed class PaymentController : ApiController
{
    private readonly PaymentService _svc;
    public PaymentController(PaymentService svc) => _svc = svc;

    [HttpGet("/api/v1/payments/providers")]
    [Authorize]
    public IActionResult Providers() => OkData(_svc.Providers());

    // IPN: no JWT — HMAC signature is the credential. GET and POST like Go.
    [HttpGet("/api/v1/payments/{provider}/ipn")]
    [HttpPost("/api/v1/payments/{provider}/ipn")]
    [AllowAnonymous]
    public async Task<IActionResult> Notify(string provider,
        [FromQuery] string txn_ref = "", [FromQuery] long amount = 0,
        [FromQuery] string status = "", [FromQuery] string provider_txn_id = "",
        [FromQuery] string sig = "")
        => Ok(await _svc.NotifyAsync(provider, txn_ref, amount, status, provider_txn_id, sig));

    private new IActionResult Ok(object v) => base.OkData(v);

    [HttpGet("/api/v1/payments/{provider}/return")]
    [AllowAnonymous]
    public async Task<IActionResult> Return(string provider,
        [FromQuery] string txn_ref = "", [FromQuery] string status = "",
        [FromQuery] string sig = "")
    {
        var url = await _svc.ReturnAsync(provider, txn_ref, status, sig);
        return Redirect(url);
    }
}
