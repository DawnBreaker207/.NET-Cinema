using System.Collections.Concurrent;
using Cinema.Api.Common;

namespace Cinema.Api.Services;

// Mirrors Go email+IP login lockout: 5 consecutive failures -> 429 for 5'.
public sealed class LoginLockout
{
    private readonly int _max;
    private readonly TimeSpan _lockout;
    private readonly ConcurrentDictionary<string, (int Count, DateTime Until)> _m = new();

    public LoginLockout(IConfiguration cfg)
    {
        _max = cfg.GetValue("RateLimit:LoginMaxFailures", 5);
        _lockout = TimeSpan.FromMinutes(cfg.GetValue("RateLimit:LoginLockoutMinutes", 5));
    }

    public void Check(string email, string ip)
    {
        var k = Key(email, ip);
        if (_m.TryGetValue(k, out var e) && e.Count >= _max)
        {
            if (DateTime.UtcNow < e.Until)
            {
                var secs = (int)Math.Ceiling((e.Until - DateTime.UtcNow).TotalSeconds);
                throw new ApiException(StatusCodes.Status429TooManyRequests,
                    ErrorCodes.TooManyRequests, "account temporarily locked",
                    "login_locked", new Dictionary<string, string>
                    { ["retry_after_seconds"] = secs.ToString() });
            }
            _m.TryRemove(k, out _);
        }
    }

    public void Fail(string email, string ip)
    {
        var k = Key(email, ip);
        var e = _m.GetOrAdd(k, _ => (0, DateTime.MinValue));
        var count = e.Count + 1;
        var until = count >= _max ? DateTime.UtcNow.Add(_lockout) : DateTime.MinValue;
        _m[k] = (count, until);
    }

    public void Reset(string email, string ip) => _m.TryRemove(Key(email, ip), out _);

    private static string Key(string email, string ip)
        => (email.Trim().ToLowerInvariant() + "|" + ip).GetHashCode().ToString("x");
}
