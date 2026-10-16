using Cinema.Api.Common;
using Cinema.Api.Data;
using Cinema.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Cinema.Api.Middleware;

// Mirrors Go Auth() + account-status checks: a token for a locked/deleted
// account is rejected immediately; the DB role wins over the JWT role claim.
public sealed class AccountStatusMiddleware
{
    private readonly RequestDelegate _next;
    public AccountStatusMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext ctx, CinemaDbContext db)
    {
        var uid = ctx.User.FindFirst("uid")?.Value;
        if (ctx.User.Identity?.IsAuthenticated == true && uid is not null && Guid.TryParse(uid, out var id))
        {
            var u = await db.Users.AsNoTracking()
                .Where(x => x.Id == id)
                .Select(x => new { x.Active, x.Role, x.DeletedAt })
                .SingleOrDefaultAsync();
            if (u is null || u.DeletedAt != null)
                throw ApiException.Unauthorized("account no longer exists", "account_deleted");
            if (!u.Active)
                throw ApiException.Forbidden("account is locked", "account_locked");

            // Refresh role from DB so lock/role changes apply without re-login.
            // Keep both claim types: "role" (JWT/Smart scheme) and ClaimTypes.Role (cookie scheme).
            var identity = (System.Security.Claims.ClaimsIdentity)ctx.User.Identity;
            foreach (var c in ctx.User.FindAll("role").ToList()) identity.RemoveClaim(c);
            foreach (var c in ctx.User.FindAll(System.Security.Claims.ClaimTypes.Role).ToList()) identity.RemoveClaim(c);
            identity.AddClaim(new System.Security.Claims.Claim("role", u.Role));
            identity.AddClaim(new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.Role, u.Role));
            identity.AddClaim(new System.Security.Claims.Claim("db_role", u.Role));
        }
        await _next(ctx);
    }
}

// OptionalAuth: no token -> anonymous; present-but-invalid token -> 401.
public static class OptionalAuth
{
    public static async Task<User?> CurrentAsync(HttpContext ctx, CinemaDbContext db, JwtService jwt)
    {
        var uid = ctx.User.FindFirst("uid")?.Value;
        if (ctx.User.Identity?.IsAuthenticated == true && uid is not null && Guid.TryParse(uid, out var id))
        {
            var u = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id);
            if (u is null || u.DeletedAt != null)
                throw ApiException.Unauthorized("account no longer exists", "account_deleted");
            if (!u.Active) throw ApiException.Forbidden("account is locked", "account_locked");
            return u;
        }
        var header = ctx.Request.Headers.Authorization.ToString();
        if (string.IsNullOrEmpty(header)) return null;
        var token = header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
            ? header["Bearer ".Length..].Trim() : header.Trim();
        if (token.Length == 0) return null;
        var claims = jwt.ValidateAccess(token); // throws 401 on bad/expired
        if (!Guid.TryParse(claims.UserId, out var oid)) throw ApiException.Unauthorized();
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == oid);
        if (user is null || user.DeletedAt != null)
            throw ApiException.Unauthorized("account no longer exists", "account_deleted");
        if (!user.Active) throw ApiException.Forbidden("account is locked", "account_locked");
        return user;
    }
}
