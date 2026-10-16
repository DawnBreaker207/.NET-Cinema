using System.Text.Json;
using Cinema.Api.Common;
using Cinema.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Cinema.Api.Controllers.Api;

// Realtime seat map (Go F11): short-lived token over JWT, stream without JWT.
public sealed class SseController : ApiController
{
    private readonly SseHub _hub;
    public SseController(SseHub hub) => _hub = hub;

    [HttpGet("/api/v1/events/token")]
    [Authorize]
    [EnableRateLimiting("public")]
    public IActionResult Token([FromQuery] string show_id)
    {
        if (!Guid.TryParse(show_id, out _))
            throw ApiException.BadRequest("bad show_id", "bad_show");
        var t = _hub.IssueToken(show_id);
        return OkData(new { token = t, stream_url = $"/api/v1/events/shows/{show_id}?token={t}" });
    }

    [HttpGet("/api/v1/events/shows/{id}")]
    [AllowAnonymous]
    public async Task Stream(string id, [FromQuery] string token, CancellationToken ct)
    {
        if (!_hub.CheckToken(token, id))
        {
            Response.StatusCode = 401;
            await Response.WriteAsync("""{"code":40100,"message":"unauthorized"}""", ct);
            return;
        }
        Response.Headers.ContentType = "text/event-stream";
        Response.Headers.CacheControl = "no-cache";
        Response.Headers["X-Accel-Buffering"] = "no";
        var (subId, reader) = _hub.Subscribe(id);
        using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(30));
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, timeout.Token, HttpContext.RequestAborted);
        try
        {
            await Response.WriteAsync("retry: 3000\n\n", linked.Token);
            await Response.Body.FlushAsync(linked.Token);
            using var ping = new PeriodicTimer(TimeSpan.FromSeconds(15));
            var tickTask = ping.WaitForNextTickAsync(linked.Token).AsTask();
            while (!linked.Token.IsCancellationRequested)
            {
                var readTask = reader.WaitToReadAsync(linked.Token).AsTask();
                var done = await Task.WhenAny(readTask, tickTask);
                if (done == tickTask)
                {
                    await tickTask; // observe (throws on cancel)
                    tickTask = ping.WaitForNextTickAsync(linked.Token).AsTask();
                    await Response.WriteAsync(": ping\n\n", linked.Token);
                }
                else
                {
                    while (reader.TryRead(out var ev))
                    {
                        var json = JsonSerializer.Serialize(new
                        {
                            type = ev.Type,
                            showtime_id = id,
                            seats = ev.Data,
                            at = ev.At,
                        }, new JsonSerializerOptions { PropertyNamingPolicy = SnakeCaseNamingPolicy.Instance });
                        await Response.WriteAsync($"event: seats\ndata: {json}\n\n", linked.Token);
                    }
                }
                await Response.Body.FlushAsync(linked.Token);
            }
        }
        catch (OperationCanceledException) { }
        finally { _hub.Unsubscribe(id, subId); }
    }
}
