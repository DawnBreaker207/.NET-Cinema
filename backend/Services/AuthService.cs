using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Cinema.Api.Common;
using Cinema.Api.Data;
using Cinema.Api.Dtos;
using Cinema.Api.Models;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Cinema.Api.Services;

public sealed class AuthService
{
    private readonly CinemaDbContext _db;
    private readonly JwtService _jwt;
    private readonly LoginLockout _lockout;
    private readonly IConfiguration _cfg;

    public AuthService(CinemaDbContext db, JwtService jwt, LoginLockout lockout, IConfiguration cfg)
    {
        _db = db; _jwt = jwt; _lockout = lockout; _cfg = cfg;
    }

    public static UserResponse ToUser(User u)
        => new(u.Id, u.Email, u.FullName, u.Phone, u.Role, u.Active, u.CreatedAt, u.UpdatedAt);

    // ---- register ----
    public async Task<UserResponse> RegisterAsync(RegisterRequest r)
    {
        ValidateEmail(r.Email);
        if (string.IsNullOrWhiteSpace(r.Password) || r.Password.Length < 6 || r.Password.Length > 72)
            throw ApiException.Validation(new() { ["password"] = "must be 6..72 chars" });
        if (string.IsNullOrWhiteSpace(r.FullName) || r.FullName.Length is < 2 or > 255)
            throw ApiException.Validation(new() { ["full_name"] = "must be 2..255 chars" });

        var now = DateTime.UtcNow;
        _db.Users.Add(new User
        {
            Id = Guid.NewGuid(),
            Email = r.Email.Trim().ToLowerInvariant(),
            Password = BCrypt.Net.BCrypt.HashPassword(r.Password),
            FullName = r.FullName.Trim(),
            Role = "customer",
            CreatedAt = now,
            UpdatedAt = now,
        });
        try { await _db.SaveChangesAsync(); }
        catch (DbUpdateException ex) when (IsUnique(ex))
        {
            throw ApiException.Conflict("email already registered", "email_taken");
        }
        var u = await _db.Users.SingleAsync(x => x.Email == r.Email.Trim().ToLowerInvariant());
        return ToUser(u);
    }

    // ---- login ----
    public async Task<LoginResponse> LoginAsync(LoginRequest r, string ip, string? ua)
    {
        var email = (r.Email ?? "").Trim().ToLowerInvariant();
        _lockout.Check(email, ip);
        var u = await _db.Users.SingleOrDefaultAsync(x => x.Email == email && x.DeletedAt == null);
        if (u is null)
        {
            // Same-cost dummy verify so timing does not reveal account existence.
            BCrypt.Net.BCrypt.Verify(r.Password ?? "", DummyHash);
            _lockout.Fail(email, ip);
            throw ApiException.Unauthorized("invalid email or password", "invalid_credentials");
        }
        if (!u.Active)
            throw ApiException.Forbidden("account is locked", "account_locked");
        if (!BCrypt.Net.BCrypt.Verify(r.Password ?? "", u.Password))
        {
            _lockout.Fail(email, ip);
            throw ApiException.Unauthorized("invalid email or password", "invalid_credentials");
        }
        _lockout.Reset(email, ip);
        var (access, refresh, exp, rid, rexp) = _jwt.GeneratePair(u.Id.ToString(), u.Email, u.Role);
        var now = DateTime.UtcNow;
        _db.RefreshTokens.Add(new RefreshToken
        {
            Id = Guid.Parse(rid),
            UserId = u.Id,
            FamilyId = Guid.NewGuid(),
            ExpiresAt = rexp,
            DeviceId = r.DeviceId ?? "",
            UserAgent = ua,
            LastUsedAt = now,
            CreatedAt = now,
        });
        await _db.SaveChangesAsync();
        return new LoginResponse(access, refresh, "Bearer", exp, ToUser(u));
    }

    // ---- refresh (rotation; replay revokes the whole family) ----
    public async Task<TokenResponse> RefreshAsync(string token, string? ua)
    {
        var claims = _jwt.ValidateRefresh(token);
        var jti = Guid.TryParse(claims.TokenId, out var g) ? g : Guid.Empty;
        var uid = Guid.Parse(claims.UserId);
        await using var tx = await _db.Database.BeginTransactionAsync();
        var stored = await _db.RefreshTokens
            .FromSqlRaw(@"SELECT * FROM refresh_tokens WHERE id = {0} FOR UPDATE", jti)
            .SingleOrDefaultAsync();
        if (stored is null || stored.UserId != uid || stored.RevokedAt != null)
            throw ApiException.Unauthorized("please log in again", "invalid_token");
        if (stored.UsedAt != null)
        {
            await _db.RefreshTokens.Where(x => x.FamilyId == stored.FamilyId && x.RevokedAt == null)
                .ExecuteUpdateAsync(x => x.SetProperty(t => t.RevokedAt, DateTime.UtcNow));
            await tx.CommitAsync();
            throw ApiException.Unauthorized("please log in again", "invalid_token");
        }
        var u = await _db.Users.SingleOrDefaultAsync(x => x.Id == uid && x.DeletedAt == null);
        if (u is null || !u.Active)
            throw ApiException.Unauthorized("please log in again", "invalid_token");
        var now = DateTime.UtcNow;
        stored.UsedAt = now; stored.LastUsedAt = now;
        var (access, refresh, exp, rid, rexp) = _jwt.GeneratePair(u.Id.ToString(), u.Email, u.Role);
        _db.RefreshTokens.Add(new RefreshToken
        {
            Id = Guid.Parse(rid),
            UserId = uid,
            FamilyId = stored.FamilyId,
            ExpiresAt = rexp,
            DeviceId = stored.DeviceId,
            UserAgent = ua ?? stored.UserAgent,
            LastUsedAt = now,
            CreatedAt = now,
        });
        await _db.SaveChangesAsync();
        await tx.CommitAsync();
        return new TokenResponse(access, refresh, "Bearer", exp);
    }

    // ---- logout (revoke family; always 200) ----
    public async Task LogoutAsync(string? token)
    {
        if (token is null) return;
        try
        {
            var claims = _jwt.ValidateRefresh(token);
            if (!Guid.TryParse(claims.TokenId, out var jti)) return;
            var row = await _db.RefreshTokens.SingleOrDefaultAsync(x => x.Id == jti);
            if (row is null) return;
            await _db.RefreshTokens.Where(x => x.FamilyId == row.FamilyId && x.RevokedAt == null)
                .ExecuteUpdateAsync(x => x.SetProperty(t => t.RevokedAt, DateTime.UtcNow));
        }
        catch (ApiException) { /* already-logged-out tokens still return 200 */ }
    }

    public async Task AcceptTermsAsync(Guid uid)
    {
        var u = await RequireActiveAsync(uid);
        u.AcceptedTermsVersion = _cfg.GetValue("Legal:TermsVersion", 1);
        u.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
    }

    // ---- forgot / reset (always 200 on forgot; token = sha256 hex, 30', one-shot) ----
    public async Task ForgotAsync(string email)
    {
        var u = await _db.Users.SingleOrDefaultAsync(
            x => x.Email == email.Trim().ToLowerInvariant() && x.DeletedAt == null && x.Active);
        if (u is null) return;
        var raw = RandomNumberGenerator.GetBytes(32);
        var token = Convert.ToHexString(raw).ToLowerInvariant();
        using var sha = SHA256.Create();
        var hash = Convert.ToHexString(sha.ComputeHash(Encoding.ASCII.GetBytes(token))).ToLowerInvariant();
        var ttlMin = _cfg.GetValue("Account:PasswordResetMinutes", 30);
        var now = DateTime.UtcNow;
        await _db.PasswordResetTokens.Where(x => x.UserId == u.Id && x.UsedAt == null)
            .ExecuteUpdateAsync(x => x.SetProperty(t => t.UsedAt, now));
        _db.PasswordResetTokens.Add(new PasswordResetToken
        {
            Id = Guid.NewGuid(),
            UserId = u.Id,
            TokenHash = hash,
            ExpiresAt = now.AddMinutes(ttlMin),
            CreatedAt = now,
        });
        await _db.SaveChangesAsync();
        var baseUrl = _cfg.GetValue("Account:PasswordResetUrl", "http://localhost:5173/reset-password");
        Directory.CreateDirectory(_cfg.GetValue("Mail:OutboxDir", "tmp/mail")!);
        var html = $"<html><body><p>Reset your password:</p><a href=\"{baseUrl}?token={token}\">Reset password</a></body></html>";
        await File.WriteAllTextAsync(
            Path.Combine(_cfg.GetValue("Mail:OutboxDir", "tmp/mail")!, $"reset-{u.Id}-{now:yyyyMMddHHmmss}.html"), html);
    }

    public async Task ResetAsync(ResetPasswordRequest r)
    {
        if (r.NewPassword is not { Length: >= 6 and <= 72 })
            throw ApiException.Validation(new() { ["new_password"] = "must be 6..72 chars" });
        using var sha = SHA256.Create();
        var hash = Convert.ToHexString(sha.ComputeHash(Encoding.ASCII.GetBytes(r.Token.Trim())))
            .ToLowerInvariant();
        var row = await _db.PasswordResetTokens
            .SingleOrDefaultAsync(x => x.TokenHash == hash && x.UsedAt == null);
        if (row is null || row.ExpiresAt <= DateTime.UtcNow)
            throw ApiException.BadRequest("invalid or expired token", "invalid_reset_token");
        var now = DateTime.UtcNow;
        row.UsedAt = now;
        var u = await _db.Users.SingleAsync(x => x.Id == row.UserId);
        u.Password = BCrypt.Net.BCrypt.HashPassword(r.NewPassword);
        u.UpdatedAt = now;
        await _db.RefreshTokens.Where(x => x.UserId == u.Id && x.RevokedAt == null)
            .ExecuteUpdateAsync(x => x.SetProperty(t => t.RevokedAt, now));
        await _db.SaveChangesAsync();
    }

    // ---- me ----
    public async Task<UserResponse> MeAsync(Guid uid)
        => ToUser(await RequireActiveAsync(uid));

    public async Task<UserResponse> UpdateMeAsync(Guid uid, UpdateMeRequest r)
    {
        var u = await RequireActiveAsync(uid);
        if (r.FullName is not null)
        {
            if (r.FullName.Length is < 2 or > 255)
                throw ApiException.Validation(new() { ["full_name"] = "must be 2..255 chars" });
            u.FullName = r.FullName.Trim();
        }
        if (r.Phone is not null)
        {
            if (r.Phone != "" && !Regex.IsMatch(r.Phone, @"^\+?[0-9]{8,15}$"))
                throw ApiException.Validation(new() { ["phone"] = "invalid phone format" });
            u.Phone = r.Phone == "" ? null : r.Phone;
        }
        u.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return ToUser(u);
    }

    public async Task<TokenResponse> ChangePasswordAsync(Guid uid, ChangePasswordRequest r)
    {
        var u = await RequireActiveAsync(uid);
        if (!BCrypt.Net.BCrypt.Verify(r.CurrentPassword, u.Password))
            throw ApiException.Unauthorized("current password is wrong", "wrong_password");
        if (r.NewPassword is not { Length: >= 6 and <= 72 })
            throw ApiException.Validation(new() { ["new_password"] = "must be 6..72 chars" });
        var now = DateTime.UtcNow;
        u.Password = BCrypt.Net.BCrypt.HashPassword(r.NewPassword);
        u.UpdatedAt = now;
        await _db.RefreshTokens.Where(x => x.UserId == uid && x.RevokedAt == null)
            .ExecuteUpdateAsync(x => x.SetProperty(t => t.RevokedAt, now));
        var (access, refresh, exp, rid, rexp) = _jwt.GeneratePair(u.Id.ToString(), u.Email, u.Role);
        _db.RefreshTokens.Add(new RefreshToken
        {
            Id = Guid.Parse(rid),
            UserId = uid,
            FamilyId = Guid.NewGuid(),
            ExpiresAt = rexp,
            CreatedAt = now,
            LastUsedAt = now,
        });
        await _db.SaveChangesAsync();
        return new TokenResponse(access, refresh, "Bearer", exp);
    }

    public async Task DeleteMeAsync(Guid uid, string password)
    {
        var u = await _db.Users.SingleOrDefaultAsync(x => x.Id == uid && x.DeletedAt == null)
            ?? throw ApiException.Unauthorized();
        if (u.Role != "customer")
            throw ApiException.Forbidden("only customers can delete their own account", "forbidden");
        if (!BCrypt.Net.BCrypt.Verify(password, u.Password))
            throw ApiException.Unauthorized("password is wrong", "wrong_password");
        if (await _db.Bookings.AnyAsync(x => x.UserId == uid && x.Status == "pending"))
            throw ApiException.Conflict("you still have a pending order", "pending_order_exists");
        var now = DateTime.UtcNow;
        u.Email = $"deleted-{u.Id}@deleted.local";
        u.FullName = "Deleted user";
        u.Phone = null;
        u.Password = BCrypt.Net.BCrypt.HashPassword(Guid.NewGuid().ToString());
        u.Active = false;
        u.DeletedAt = now;
        u.UpdatedAt = now;
        await _db.RefreshTokens.Where(x => x.UserId == uid && x.RevokedAt == null)
            .ExecuteUpdateAsync(x => x.SetProperty(t => t.RevokedAt, now));
        await _db.SaveChangesAsync();
    }

    public async Task<List<SessionResponse>> SessionsAsync(Guid uid, string? deviceId)
        => await _db.RefreshTokens.AsNoTracking()
            .Where(x => x.UserId == uid && x.RevokedAt == null && x.UsedAt == null)
            .OrderByDescending(x => x.CreatedAt)
            .Select(x => new SessionResponse(x.Id, x.UserAgent, x.LastUsedAt, x.CreatedAt,
                deviceId != null && x.DeviceId == deviceId))
            .ToListAsync();

    public async Task RevokeSessionAsync(Guid uid, Guid sessionId)
    {
        var n = await _db.RefreshTokens
            .Where(x => x.Id == sessionId && x.UserId == uid && x.RevokedAt == null)
            .ExecuteUpdateAsync(x => x.SetProperty(t => t.RevokedAt, DateTime.UtcNow));
        if (n == 0) throw ApiException.NotFound("session not found", "not_found");
    }

    public async Task<NotificationPrefsResponse> GetPrefsAsync(Guid uid)
    {
        var p = await _db.NotificationPreferences.AsNoTracking()
            .SingleOrDefaultAsync(x => x.UserId == uid);
        return p is null ? new(true, true) : new(p.BookingReminders, p.PromoOffers);
    }

    public async Task<NotificationPrefsResponse> UpdatePrefsAsync(Guid uid, UpdatePrefsRequest r)
    {
        var p = await _db.NotificationPreferences.SingleOrDefaultAsync(x => x.UserId == uid);
        var now = DateTime.UtcNow;
        if (p is null)
        {
            p = new NotificationPreference
            {
                Id = Guid.NewGuid(),
                UserId = uid,
                CreatedAt = now,
                UpdatedAt = now,
            };
            _db.NotificationPreferences.Add(p);
        }
        if (r.BookingReminders.HasValue) p.BookingReminders = r.BookingReminders.Value;
        if (r.PromoOffers.HasValue) p.PromoOffers = r.PromoOffers.Value;
        p.UpdatedAt = now;
        await _db.SaveChangesAsync();
        return new(p.BookingReminders, p.PromoOffers);
    }

    private async Task<User> RequireActiveAsync(Guid uid)
    {
        var u = await _db.Users.SingleOrDefaultAsync(x => x.Id == uid && x.DeletedAt == null)
            ?? throw ApiException.Unauthorized();
        if (!u.Active) throw ApiException.Forbidden("account is locked", "account_locked");
        return u;
    }

    private static void ValidateEmail(string email)
    {
        if (string.IsNullOrWhiteSpace(email) || email.Length > 255 ||
            !Regex.IsMatch(email, @"^[^@\s]+@[^@\s]+\.[^@\s]+$"))
            throw ApiException.Validation(new() { ["email"] = "must be a valid email address" });
    }

    private static bool IsUnique(DbUpdateException ex)
        => ex.InnerException is PostgresException pg && pg.SqlState == "23505";

    private static readonly string DummyHash = BCrypt.Net.BCrypt.HashPassword(Guid.NewGuid().ToString());
}
