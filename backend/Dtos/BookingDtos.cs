namespace Cinema.Api.Dtos;

public sealed record HoldRequest(Guid ShowId, List<Guid> SeatIds, string? IdempotencyKey);
public sealed record InitRequest(Guid ShowId);
public sealed record InitResponse(Guid BookingId, Guid ShowtimeId, DateTime ExpiresAt, long TtlSeconds, bool Reused);
public sealed record RefreshResponse(Guid BookingId, DateTime ExpiresAt);
public sealed record HeldSeat(Guid ShowtimeSeatId, string Label, string RowLabel, int ColNumber, string SeatType, long Price);
public sealed record HoldResponse(Guid BookingId, Guid ShowtimeId, long TotalAmount,
    DateTime ExpiresAt, List<HeldSeat> Seats, Guid? ReplacedBookingId);
public sealed record PayRequest(string? Provider);
public sealed record PayResponse(Guid PaymentId, string Provider, string TxnRef, string RedirectUrl, DateTime? ExpiresAt);
public sealed record PaymentSummary(Guid Id, string Provider, string TxnRef, string Status, string? StatusReason,
    long Amount, long? PaidAmount, DateTime? PaidAt, DateTime? RefundedAt);
public sealed record OrderShowtime(Guid MovieId, string MovieTitle, string AgeRating, Guid HallId,
    string HallName, DateTime StartAt, DateTime EndAt, bool Started, bool Ended);
public sealed record OrderStatusResponse(Guid Id, Guid ShowtimeId, string Status, string? StatusReason,
    long TotalAmount, long DiscountAmount, long PayableAmount, DateTime CreatedAt,
    DateTime? ExpiresAt, DateTime? PaidAt, DateTime? CollectedAt,
    PaymentSummary? Payment, OrderShowtime? Showtime);
public sealed record TicketResponse(Guid Id, Guid ShowtimeSeatId, string SeatLabel,
    string SeatType, long Price, string Code, string Status);
public sealed record OrderDetailResponse(Guid Id, Guid ShowtimeId, string Status, string? StatusReason,
    long TotalAmount, long DiscountAmount, long PayableAmount, DateTime CreatedAt,
    DateTime? ExpiresAt, DateTime? PaidAt, DateTime? CollectedAt,
    PaymentSummary? Payment, OrderShowtime? Showtime, List<TicketResponse> Tickets);
public sealed record CounterSellRequest(Guid ShowId, List<Guid> SeatIds, string? CustomerName, string? CustomerPhone);
public sealed record RedeemRequest(Guid ShowtimeId);
public sealed record RedeemResponse(string Status, Guid? TicketId, Guid? ShowtimeId, string? MovieTitle,
    string? AgeRating, string? HallName, string? SeatLabel, DateTime? StartAt,
    DateTime? CheckinOpensAt, DateTime? CheckinClosesAt);
public sealed record TicketQrResponse(Guid TicketId, string Code, string QrBase64);
public sealed record ApplyDiscountRequest(string Code);
public sealed record AdminOrderItem(Guid Id, Guid ShowtimeId, string Status, string? StatusReason,
    long TotalAmount, long DiscountAmount, long PayableAmount, DateTime CreatedAt,
    DateTime? ExpiresAt, DateTime? PaidAt, DateTime? CollectedAt,
    PaymentSummary? Payment, OrderShowtime? Showtime,
    string SoldVia, int Seats, object? Customer);
