namespace Cinema.Api.Models;

// Booking + payment (000003_booking_payment, 000012_booking_collect).
public sealed class Booking
{
    public Guid Id { get; set; }
    public Guid? UserId { get; set; }
    public Guid ShowtimeId { get; set; }
    public string Status { get; set; } = "pending";
    public string? StatusReason { get; set; }
    public long TotalAmount { get; set; }
    public Guid? DiscountCodeId { get; set; }
    public long DiscountAmount { get; set; }
    public DateTime? ExpiresAt { get; set; }
    public string? IdempotencyKey { get; set; }
    public Guid? PaymentId { get; set; }
    public DateTime? PaidAt { get; set; }
    public string SoldVia { get; set; } = "online";
    public string? CustomerName { get; set; }
    public string? CustomerPhone { get; set; }
    public int FinalizeAttempts { get; set; }
    public DateTime? NextFinalizeAt { get; set; }
    public DateTime? EmailSentAt { get; set; }
    public int EmailAttempts { get; set; }
    public DateTime? EmailClaimedUntil { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? CollectedAt { get; set; }
}

public sealed class BookingSeat
{
    public Guid Id { get; set; }
    public Guid BookingId { get; set; }
    public Guid ShowtimeSeatId { get; set; }
    public string SeatType { get; set; } = "";
    public long Price { get; set; }
    public long HoldVersion { get; set; }
    public DateTime CreatedAt { get; set; }
}

public sealed class Ticket
{
    public Guid Id { get; set; }
    public Guid BookingId { get; set; }
    public Guid ShowtimeSeatId { get; set; }
    public long Price { get; set; }
    public string Code { get; set; } = "";
    public string Status { get; set; } = "issued";
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public sealed class Payment
{
    public Guid Id { get; set; }
    public Guid BookingId { get; set; }
    public string Provider { get; set; } = "";
    public string TxnRef { get; set; } = "";
    public long Amount { get; set; }
    public string Status { get; set; } = "pending";
    public string? StatusReason { get; set; }
    public string? RedirectUrl { get; set; }
    public string? ProviderTxnId { get; set; }
    public string ProviderData { get; set; } = "{}"; // jsonb
    public long? PaidAmount { get; set; }
    public DateTime? PaidAt { get; set; }
    public DateTime? RefundedAt { get; set; }
    public DateTime? ExpiresAt { get; set; }
    public DateTime? CheckedAt { get; set; }
    public int RefundAttempts { get; set; }
    public DateTime? NextRetryAt { get; set; }
    public string? LastError { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
