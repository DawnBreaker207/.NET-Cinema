using System.Text.Json;
using Cinema.Api.Data;
using Cinema.Api.Models;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Cinema.Api.Services;

// Simplified vs Go's per-action audit: logs every mutating /api/v1 call
// with actor, outcome and route id. Reads (GET) and SSE are never logged.
public sealed class AuditFilter : IAsyncActionFilter
{
    private readonly CinemaDbContext _db;
    private readonly IHttpContextAccessor _http;
    public AuditFilter(CinemaDbContext db, IHttpContextAccessor http) { _db = db; _http = http; }

    public async Task OnActionExecutionAsync(ActionExecutingContext ctx, ActionExecutionDelegate next)
    {
        var req = ctx.HttpContext.Request;
        var write = req.Method is "POST" or "PUT" or "PATCH" or "DELETE";
        if (!write || !req.Path.StartsWithSegments("/api/v1"))
        {
            await next();
            return;
        }
        var executed = await next();
        try
        {
            var uid = _http.HttpContext?.User.FindFirst("uid")?.Value;
            var status = executed.HttpContext.Response.StatusCode;
            var ok = status < 400;
            string? err = null;
            if (!ok && executed.Exception != null) err = executed.Exception.Message;
            // action column is varchar(64): METHOD + route template, truncated.
            var template = (executed.ActionDescriptor as Microsoft.AspNetCore.Mvc.Controllers.ControllerActionDescriptor)
                ?.AttributeRouteInfo?.Template ?? req.Path.Value ?? "";
            var action = (req.Method + " /" + template.TrimStart('/')).Trim();
            if (action.Length > 64) action = action[..64];
            string? resource = null;
            if (ctx.RouteData.Values.TryGetValue("id", out var id)) resource = id?.ToString();
            if (resource?.Length > 128) resource = resource[..128];
            _db.AuditLogs.Add(new AuditLog
            {
                Id = Guid.NewGuid(),
                ActorId = Guid.TryParse(uid, out var g) ? g : null,
                ActorRole = _http.HttpContext?.User.FindFirst("db_role")?.Value
                    ?? _http.HttpContext?.User.FindFirst("role")?.Value,
                Action = action,
                ResourceType = "api",
                ResourceId = resource,
                Ip = _http.HttpContext?.Connection.RemoteIpAddress?.ToString(),
                UserAgent = req.Headers.UserAgent.ToString(),
                Outcome = ok ? "success" : "failure",
                ErrorMessage = err,
                CreatedAt = DateTime.UtcNow,
            });
            await _db.SaveChangesAsync();
        }
        catch { /* audit never breaks the request */ }
    }
}
