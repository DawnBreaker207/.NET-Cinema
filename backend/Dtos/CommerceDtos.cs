namespace Cinema.Api.Dtos;

public sealed record ComboResponse(Guid Id, string Name, string? Description, long Price,
    string? ImageUrl, bool Active, DateTime CreatedAt, DateTime UpdatedAt);
public sealed record ComboRequest(string Name, string? Description, long Price, string? ImageUrl, bool? Active);
public sealed record ComboOrderItemRequest(Guid ComboId, int Quantity);
public sealed record ComboOrderRequest(Guid? BookingId, List<ComboOrderItemRequest> Items);
public sealed record ComboOrderItemResponse(Guid ComboId, string ComboName, int Quantity, long UnitPrice);
public sealed record ComboOrderResponse(Guid Id, Guid? BookingId, string Status, long Total, string SoldChannel,
    List<ComboOrderItemResponse> Items, DateTime CreatedAt);
public sealed record CounterComboRequest(List<ComboOrderItemRequest> Items, string? PayMethod, string? CustomerName);

public sealed record ArticleResponse(Guid Id, string Title, string Slug, string? Summary,
    string? ThumbnailUrl, string Content, string Type, string Status, long Views,
    DateTime CreatedAt, DateTime UpdatedAt);
public sealed record ArticleRequest(string? Title, string? Summary, string? ThumbnailUrl,
    string? Content, string? Type, string? Status);

public sealed record PricingRuleResponse(Guid Id, string Name, short? DayOfWeek, string? StartTime,
    string? EndTime, string? SpecificDate, string AdjustKind, int AdjustValue,
    int Priority, bool Active);
public sealed record PricingRuleRequest(string? Name, short? DayOfWeek, string? StartTime, string? EndTime,
    string? SpecificDate, string? AdjustKind, long? AdjustValue, int? Priority, bool? Active);

public sealed record DiscountResponse(Guid Id, string Code, string? Description, string Kind, long Value,
    long? MaxDiscount, long MinOrder, DateTime? StartsAt, DateTime? EndsAt, int? MaxUses,
    int UsedCount, bool Active, Guid? CampaignId);
public sealed record DiscountRequest(string? Code, string? Description, string? Kind, long? Value,
    long? MaxDiscount, long? MinOrder, DateTime? StartsAt, DateTime? EndsAt, int? MaxUses, bool? Active);

public sealed record CampaignResponse(Guid Id, string Name, string? Description, DateTime StartsAt,
    DateTime EndsAt, bool Active, int PerUserLimit, DateTime CreatedAt, DateTime UpdatedAt);
public sealed record CampaignRequest(string? Name, string? Description, DateTime? StartsAt,
    DateTime? EndsAt, bool? Active, int? PerUserLimit);
