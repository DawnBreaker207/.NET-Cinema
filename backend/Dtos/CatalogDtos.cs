namespace Cinema.Api.Dtos;

// Mirrors Go internal/dto movie/showtime/hall/pricing shapes (snake_case via JSON policy).
public sealed record MovieRequest(string Title, string Genre, int Duration, string Director,
    string? Description, string? PosterUrl, string? BackdropUrl, string? TrailerUrl,
    string? Cast, string? AgeRating, string ReleaseDate, string Status);

public sealed record MovieResponse(Guid Id, string Title, string Genre, int Duration, string Director,
    string? Description, string? PosterUrl, string? BackdropUrl, string? TrailerUrl,
    string? Cast, string AgeRating, string ReleaseDate, string Status,
    DateTime CreatedAt, DateTime UpdatedAt);

public sealed record ShowtimeRequest(Guid MovieId, Guid HallId, DateTime StartAt, string? Status);

public sealed record ShowtimeResponse(Guid Id, Guid MovieId, string MovieTitle, string AgeRating,
    Guid HallId, string HallName, DateTime StartAt, DateTime EndAt, string Status,
    DateTime CreatedAt, DateTime UpdatedAt);

public sealed record ShowtimeListItem(Guid Id, Guid MovieId, string MovieTitle, string AgeRating,
    Guid HallId, string HallName, DateTime StartAt, DateTime EndAt, string Status, long? FromPrice);

public sealed record SeatMapSeat(Guid Id, Guid? ShowtimeSeatId, string Label, string RowLabel,
    int ColNumber, string SeatType, bool IsGap, int ColSpan, string Status, long Price);

public sealed record SeatMapResponse(Guid ShowtimeId, Guid MovieId, string MovieTitle, string AgeRating,
    Guid HallId, string HallName, DateTime StartAt, DateTime EndAt, string Status,
    string ScreenPosition, List<int> AisleAfterCols, Dictionary<string, long> Prices,
    List<SeatMapSeat> Seats);

public sealed record HallResponse(Guid Id, string Name, int Rows, int SeatsPerRow,
    string ScreenPosition, List<int> AisleAfterCols, bool Active);

public sealed record HallRequest(string Name, string? Template, int Rows, int SeatsPerRow,
    Dictionary<string, List<string>>? SeatTypes, List<string>? Gaps, List<string>? Spans,
    string? ScreenPosition, List<int>? AisleAfterCols, bool? Active);

public sealed record UpdateHallRequest(string? Name, string? ScreenPosition,
    List<int>? AisleAfterCols, bool? Active);

public sealed record CloneHallRequest(string Name);
public sealed record SeatSelector(List<string>? Labels, List<string>? Rows, List<int>? Cols, string? Range);
public sealed record SeatChange(SeatSelector Selector, string? SeatType, bool? IsGap);
public sealed record BulkSeatUpdateRequest(List<SeatChange> Changes);
public sealed record SeatUpdateRequest(string? SeatType, bool? IsGap);
public sealed record MergeSeatsRequest(string LeftLabel, string RightLabel);
public sealed record SplitSeatRequest(string Label);
public sealed record AddSeatRequest(string RowLabel, string? SeatType);
public sealed record HallTemplateResponse(string Name, int Rows, int SeatsPerRow,
    int SeatCount, Dictionary<string, int> SeatCountByType);

public sealed record SeatResponse(Guid Id, Guid HallId, string Label, string RowLabel,
    int ColNumber, string SeatType, bool IsGap, int ColSpan);

public sealed record BasePriceResponse(string SeatType, long Price);
public sealed record BasePriceRequest(Dictionary<string, long> Prices);
public sealed record AppliedRuleResponse(Guid RuleId, string Name, string AdjustKind, int AdjustValue);
public sealed record PricingQuoteResponse(long Base, List<AppliedRuleResponse> Applied, long Final);

public static class SeatLabels
{
    public static string Label(string row, int col) => row + col;
    public static string RowLabel(int n)
    {
        var s = "";
        while (n > 0) { n--; s = (char)('A' + n % 26) + s; n /= 26; }
        return s;
    }
}
