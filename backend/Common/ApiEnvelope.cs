using System.Text.Json;
using Microsoft.AspNetCore.Mvc;

namespace Cinema.Api.Common;

public static class ErrorCodes
{
    public const int Success = 0;
    public const int BadRequest = 40000;
    public const int Validation = 40001;
    public const int Unauthorized = 40100;
    public const int TokenExpired = 40101;
    public const int Forbidden = 40300;
    public const int NotFound = 40400;
    public const int Conflict = 40900;
    public const int PayloadTooLarge = 41300;
    public const int TermsRequired = 42800;
    public const int TooManyRequests = 42900;
    public const int Internal = 50000;
    public const int BadGateway = 50200;
    public const int ServiceUnavailable = 50300;
}

public sealed class ApiException : Exception
{
    public int Status { get; }
    public int Code { get; }
    public string? Reason { get; }
    public Dictionary<string, string>? Details { get; }

    public ApiException(int status, int code, string message, string? reason = null,
        Dictionary<string, string>? details = null) : base(message)
    {
        Status = status; Code = code; Reason = reason; Details = details;
    }

    public static ApiException BadRequest(string m, string? r = null, Dictionary<string, string>? d = null)
        => new(StatusCodes.Status400BadRequest, ErrorCodes.BadRequest, m, r, d);
    public static ApiException Validation(Dictionary<string, string> d)
        => new(StatusCodes.Status400BadRequest, ErrorCodes.Validation, "validation failed", "validation_failed", d);
    public static ApiException Unauthorized(string m = "unauthorized", string? r = "unauthorized")
        => new(StatusCodes.Status401Unauthorized, ErrorCodes.Unauthorized, m, r);
    public static ApiException TokenExpired()
        => new(StatusCodes.Status401Unauthorized, ErrorCodes.TokenExpired, "token has expired", "token_expired");
    public static ApiException Forbidden(string m = "forbidden", string? r = "forbidden")
        => new(StatusCodes.Status403Forbidden, ErrorCodes.Forbidden, m, r);
    public static ApiException NotFound(string m = "not found", string? r = "not_found")
        => new(StatusCodes.Status404NotFound, ErrorCodes.NotFound, m, r);
    public static ApiException Conflict(string m, string? r = null)
        => new(StatusCodes.Status409Conflict, ErrorCodes.Conflict, m, r);
    public static ApiException TooMany(string m = "too many requests", string? r = "rate_limited")
        => new(StatusCodes.Status429TooManyRequests, ErrorCodes.TooManyRequests, m, r);
    public static ApiException Internal(string m = "internal error")
        => new(StatusCodes.Status500InternalServerError, ErrorCodes.Internal, m, "internal_error");
}

// Mirrors Go pkg/response: { code, message, data?, reason?, details? }.
public sealed record ApiBody<T>(int Code, string Message, T? Data, string? Reason, Dictionary<string, string>? Details);

public sealed record PageMeta(int Page, int PageSize, long Total, int TotalPages);
public sealed record Paged<T>(IReadOnlyList<T> Items, PageMeta Meta);

[ApiController]
public abstract class ApiController : ControllerBase
{
    protected IActionResult OkData<T>(T data)
        => Ok(new ApiBody<T>(ErrorCodes.Success, "success", data, null, null));

    protected IActionResult CreatedData<T>(T data)
        => StatusCode(StatusCodes.Status201Created,
            new ApiBody<T>(ErrorCodes.Success, "created", data, null, null));

    protected IActionResult PagedData<T>(IReadOnlyList<T> items, int page, int pageSize, long total)
    {
        var totalPages = pageSize > 0 ? (int)((total + pageSize - 1) / pageSize) : 0;
        return Ok(new ApiBody<Paged<T>>(ErrorCodes.Success, "success",
            new Paged<T>(items, new PageMeta(page, pageSize, total, totalPages)), null, null));
    }

    protected static (int Page, int PageSize) Paging(int? page, int? pageSize, int max = 100)
    {
        var p = page is > 0 ? page.Value : 1;
        var ps = pageSize is > 0 ? Math.Min(pageSize.Value, max) : 10;
        return (p, ps);
    }
}

public sealed class ApiExceptionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ApiExceptionMiddleware> _log;
    public ApiExceptionMiddleware(RequestDelegate next, ILogger<ApiExceptionMiddleware> log)
    { _next = next; _log = log; }

    public async Task InvokeAsync(HttpContext ctx)
    {
        try { await _next(ctx); }
        catch (Exception ex) when (ctx.Response.HasStarted)
        {
            // Streaming (SSE) already owns the response; just abort it.
            _log.LogError(ex, "unhandled {Path}", ctx.Request.Path);
            ctx.Abort();
        }
        catch (ApiException ex)
        {
            ctx.Response.StatusCode = ex.Status;
            ctx.Response.ContentType = "application/json";
            if (ex.Details?.TryGetValue("retry_after_seconds", out var secs) == true)
                ctx.Response.Headers.RetryAfter = secs;
            await ctx.Response.WriteAsync(JsonSerializer.Serialize(
                new ApiBody<object>(ex.Code, ex.Message, null, ex.Reason, ex.Details),
                new JsonSerializerOptions
                {
                    PropertyNamingPolicy = SnakeCaseNamingPolicy.Instance,
                    DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
                }));
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "unhandled {Path}", ctx.Request.Path);
            ctx.Response.StatusCode = 500;
            ctx.Response.ContentType = "application/json";
            await ctx.Response.WriteAsync("""{"code":50000,"message":"internal error","reason":"internal_error"}""");
        }
    }
}
