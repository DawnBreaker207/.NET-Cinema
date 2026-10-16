using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace Cinema.Api.Common;

// Issues/validates tokens byte-compatible with the Go pkg/jwt format:
// claims { uid, email, role, typ } + HS256, separate access/refresh secrets.
public sealed record CinemaClaims(string UserId, string Email, string Role, string TokenId);

public sealed class JwtService
{
    private readonly byte[] _accessSecret;
    private readonly byte[] _refreshSecret;
    private readonly string _issuer;
    private readonly TimeSpan _accessTtl;
    private readonly TimeSpan _refreshTtl;

    public JwtService(IConfiguration cfg)
    {
        _accessSecret = Encoding.UTF8.GetBytes(cfg["Jwt:AccessSecret"]!);
        _refreshSecret = Encoding.UTF8.GetBytes(cfg["Jwt:RefreshSecret"]!);
        _issuer = cfg["Jwt:Issuer"] ?? "cinema";
        _accessTtl = TimeSpan.FromMinutes(cfg.GetValue("Jwt:AccessMinutes", 15));
        _refreshTtl = TimeSpan.FromHours(cfg.GetValue("Jwt:RefreshHours", 168));
    }

    public (string Access, string Refresh, long ExpiresIn, string RefreshId, DateTime RefreshExp) GeneratePair(
        string userId, string email, string role)
    {
        var now = DateTime.UtcNow;
        var access = Sign(userId, email, role, "access", _accessSecret, now.Add(_accessTtl), out _);
        var refresh = Sign(userId, email, role, "refresh", _refreshSecret, now.Add(_refreshTtl), out var rid);
        return (access, refresh, (long)_accessTtl.TotalSeconds, rid, now.Add(_refreshTtl));
    }

    public CinemaClaims ValidateAccess(string token) => Validate(token, _accessSecret, "access");
    public CinemaClaims ValidateRefresh(string token) => Validate(token, _refreshSecret, "refresh");

    private static string Sign(string uid, string email, string role, string typ,
        byte[] secret, DateTime exp, out string jti)
    {
        jti = Guid.NewGuid().ToString();
        var now = DateTime.UtcNow;
        var handler = new JwtSecurityTokenHandler();
        var desc = new SecurityTokenDescriptor
        {
            Issuer = "cinema",
            Subject = new ClaimsIdentity(new[]
            {
                new Claim("uid", uid),
                new Claim("email", email),
                new Claim("role", role),
                new Claim("typ", typ),
                new Claim(JwtRegisteredClaimNames.Sub, uid),
                new Claim(JwtRegisteredClaimNames.Jti, jti),
            }),
            NotBefore = now,
            IssuedAt = now,
            Expires = exp,
            SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(secret),
                SecurityAlgorithms.HmacSha256Signature)
        };
        return handler.WriteToken(handler.CreateToken(desc));
    }

    private CinemaClaims Validate(string token, byte[] secret, string expectedTyp)
    {
        var handler = new JwtSecurityTokenHandler { MapInboundClaims = false };
        try
        {
            handler.ValidateToken(token, new TokenValidationParameters
            {
                ValidateIssuer = false,
                ValidateAudience = false,
                ValidateLifetime = true,
                ClockSkew = TimeSpan.FromSeconds(30),
                RequireSignedTokens = true,
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(secret),
            }, out var validated);
            var jwt = (JwtSecurityToken)validated;
            var typ = jwt.Claims.FirstOrDefault(c => c.Type == "typ")?.Value;
            if (typ != expectedTyp) throw ApiException.Unauthorized("invalid token", "invalid_token");
            return new CinemaClaims(
                jwt.Claims.First(c => c.Type == "uid").Value,
                jwt.Claims.FirstOrDefault(c => c.Type == "email")?.Value ?? "",
                jwt.Claims.FirstOrDefault(c => c.Type == "role")?.Value ?? "customer",
                jwt.Claims.FirstOrDefault(c => c.Type == JwtRegisteredClaimNames.Jti)?.Value ?? "");
        }
        catch (SecurityTokenExpiredException) { throw ApiException.TokenExpired(); }
        catch (ApiException) { throw; }
        catch (Exception) { throw ApiException.Unauthorized("invalid token", "invalid_token"); }
    }
}
