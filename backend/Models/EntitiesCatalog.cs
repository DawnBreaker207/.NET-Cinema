namespace Cinema.Api.Models;

// Catalog: movies / halls / seats / showtimes / showtime_seats (000002_catalog)
// + global pricing (000010_pricing). Money in VND as long.
public sealed class Movie
{
    public Guid Id { get; set; }
    public string Title { get; set; } = "";
    public string Genre { get; set; } = "";
    public int Duration { get; set; }
    public string Director { get; set; } = "";
    public string? Description { get; set; }
    public string? PosterUrl { get; set; }
    public string? BackdropUrl { get; set; }
    public string? TrailerUrl { get; set; }
    public string? CastMembers { get; set; }
    public string AgeRating { get; set; } = "P";
    public DateOnly ReleaseDate { get; set; }
    public string Status { get; set; } = "draft";
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? DeletedAt { get; set; }
}

public sealed class Hall
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public int Rows { get; set; }
    public int SeatsPerRow { get; set; }
    public string ScreenPosition { get; set; } = "front";
    public string AisleAfterCols { get; set; } = "[]"; // jsonb
    public bool Active { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? DeletedAt { get; set; }
}

public sealed class Seat
{
    public Guid Id { get; set; }
    public Guid HallId { get; set; }
    public int RowIndex { get; set; }
    public string RowLabel { get; set; } = "";
    public int ColNumber { get; set; }
    public string SeatType { get; set; } = "standard";
    public bool IsGap { get; set; }
    public short ColSpan { get; set; } = 1;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public sealed class Showtime
{
    public Guid Id { get; set; }
    public Guid MovieId { get; set; }
    public Guid HallId { get; set; }
    public DateTime StartAt { get; set; }
    public DateTime EndAt { get; set; }
    public string Status { get; set; } = "open";
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? DeletedAt { get; set; }
}

public sealed class ShowtimeSeat
{
    public Guid Id { get; set; }
    public Guid ShowtimeId { get; set; }
    public Guid SeatId { get; set; }
    public string Status { get; set; } = "available";
    public Guid? HeldBy { get; set; }
    public DateTime? HeldUntil { get; set; }
    public long Version { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public sealed class SeatBasePrice
{
    public string SeatType { get; set; } = "";
    public int Price { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public sealed class PricingRule
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public short? DayOfWeek { get; set; }
    public TimeOnly? StartTime { get; set; }
    public TimeOnly? EndTime { get; set; }
    public DateOnly? SpecificDate { get; set; }
    public string AdjustKind { get; set; } = "percent";
    public int AdjustValue { get; set; }
    public int Priority { get; set; }
    public bool Active { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
