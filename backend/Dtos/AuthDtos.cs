namespace Cinema.Api.Dtos;

public sealed record RegisterRequest(string Email, string Password, string FullName);
public sealed record LoginRequest(string Email, string Password, string? DeviceId);
public sealed record RefreshRequest(string RefreshToken);
public sealed record LogoutRequest(string RefreshToken);
public sealed record ForgotPasswordRequest(string Email);
public sealed record ResetPasswordRequest(string Token, string NewPassword);
public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);
public sealed record UpdateMeRequest(string? FullName, string? Phone);
public sealed record DeleteMeRequest(string Password);

public sealed record TokenResponse(string AccessToken, string RefreshToken, string TokenType, long ExpiresIn);
public sealed record UserResponse(Guid Id, string Email, string FullName, string? Phone,
    string Role, bool Active, DateTime CreatedAt, DateTime UpdatedAt);
public sealed record LoginResponse(string AccessToken, string RefreshToken, string TokenType,
    long ExpiresIn, UserResponse User);
public sealed record SessionResponse(Guid Id, string? UserAgent, DateTime? LastUsedAt,
    DateTime CreatedAt, bool IsCurrent);
public sealed record NotificationPrefsResponse(bool BookingReminders, bool PromoOffers);
public sealed record UpdatePrefsRequest(bool? BookingReminders, bool? PromoOffers);
