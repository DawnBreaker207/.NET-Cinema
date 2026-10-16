namespace Cinema.Api.Models;

// Ops + combo + article + promo (000004..000009, 000011).
public sealed class AuditLog
{
    public Guid Id { get; set; }
    public Guid? ActorId { get; set; }
    public string? ActorRole { get; set; }
    public string Action { get; set; } = "";
    public string ResourceType { get; set; } = "";
    public string? ResourceId { get; set; }
    public Guid? BookingId { get; set; }
    public string? BeforeJson { get; set; }
    public string? AfterJson { get; set; }
    public string? Ip { get; set; }
    public string? UserAgent { get; set; }
    public string Outcome { get; set; } = "success";
    public string? ErrorMessage { get; set; }
    public DateTime CreatedAt { get; set; }
}

public sealed class BatchJob
{
    public Guid Id { get; set; }
    public string JobName { get; set; } = "";
    public string TriggeredBy { get; set; } = "cron";
    public string Status { get; set; } = "running";
    public int ProcessedRows { get; set; }
    public int SkippedRows { get; set; }
    public string? ErrorMessage { get; set; }
    public DateTime StartedAt { get; set; }
    public DateTime? FinishedAt { get; set; }
    public DateTime CreatedAt { get; set; }
}

public sealed class DailyAggregate
{
    public Guid Id { get; set; }
    public DateOnly ReportDate { get; set; }
    public long TotalRevenue { get; set; }
    public int TicketsSold { get; set; }
    public int SeatsSold { get; set; }
    public int Capacity { get; set; }
    public decimal OccupancyRate { get; set; }
    public string Breakdown { get; set; } = "{}"; // jsonb
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public sealed class ConcessionItem
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public long Price { get; set; }
    public string? ImageUrl { get; set; }
    public bool Active { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? DeletedAt { get; set; }
}

public sealed class ComboOrder
{
    public Guid Id { get; set; }
    public Guid? UserId { get; set; }
    public Guid? BookingId { get; set; }
    public string Status { get; set; } = "confirmed";
    public long Total { get; set; }
    public string SoldChannel { get; set; } = "online";
    public string? PayMethod { get; set; }
    public string? CustomerName { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public sealed class ComboOrderItem
{
    public Guid Id { get; set; }
    public Guid ComboOrderId { get; set; }
    public Guid ComboId { get; set; }
    public string ComboName { get; set; } = "";
    public int Quantity { get; set; }
    public long UnitPrice { get; set; }
    public DateTime CreatedAt { get; set; }
}

public sealed class Article
{
    public Guid Id { get; set; }
    public string Title { get; set; } = "";
    public string Slug { get; set; } = "";
    public string? Summary { get; set; }
    public string? ThumbnailUrl { get; set; }
    public string Content { get; set; } = "";
    public Guid AuthorId { get; set; }
    public string Type { get; set; } = "news";
    public string Status { get; set; } = "draft";
    public long Views { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? DeletedAt { get; set; }
}

public sealed class NotificationPreference
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public bool BookingReminders { get; set; } = true;
    public bool PromoOffers { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public sealed class Campaign
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public DateTime StartsAt { get; set; }
    public DateTime EndsAt { get; set; }
    public bool Active { get; set; }
    public int PerUserLimit { get; set; } = 1;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public sealed class DiscountCode
{
    public Guid Id { get; set; }
    public string Code { get; set; } = "";
    public string? Description { get; set; }
    public string Kind { get; set; } = "";
    public long Value { get; set; }
    public long? MaxDiscount { get; set; }
    public long MinOrder { get; set; }
    public DateTime? StartsAt { get; set; }
    public DateTime? EndsAt { get; set; }
    public int? MaxUses { get; set; }
    public int UsedCount { get; set; }
    public bool Active { get; set; } = true;
    public Guid? CampaignId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? DeletedAt { get; set; }
}

public sealed class CampaignCombo
{
    public Guid CampaignId { get; set; }
    public Guid ComboId { get; set; }
    public int? PromoPrice { get; set; }
}

public sealed class CampaignArticle
{
    public Guid CampaignId { get; set; }
    public Guid ArticleId { get; set; }
}

public sealed class DiscountRedemption
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid DiscountCodeId { get; set; }
    public DateTime CreatedAt { get; set; }
}
