using Cinema.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Cinema.Api.Data;

// Entity Framework Core database context for Cinema API with Code-First migrations.
public sealed class CinemaDbContext : DbContext
{
    public CinemaDbContext(DbContextOptions<CinemaDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<PasswordResetToken> PasswordResetTokens => Set<PasswordResetToken>();
    public DbSet<Movie> Movies => Set<Movie>();
    public DbSet<Hall> Halls => Set<Hall>();
    public DbSet<Seat> Seats => Set<Seat>();
    public DbSet<Showtime> Showtimes => Set<Showtime>();
    public DbSet<ShowtimeSeat> ShowtimeSeats => Set<ShowtimeSeat>();
    public DbSet<SeatBasePrice> SeatBasePrices => Set<SeatBasePrice>();
    public DbSet<PricingRule> PricingRules => Set<PricingRule>();
    public DbSet<Booking> Bookings => Set<Booking>();
    public DbSet<BookingSeat> BookingSeats => Set<BookingSeat>();
    public DbSet<Ticket> Tickets => Set<Ticket>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<BatchJob> BatchJobs => Set<BatchJob>();
    public DbSet<DailyAggregate> DailyAggregates => Set<DailyAggregate>();
    public DbSet<ConcessionItem> ConcessionItems => Set<ConcessionItem>();
    public DbSet<ComboOrder> ComboOrders => Set<ComboOrder>();
    public DbSet<ComboOrderItem> ComboOrderItems => Set<ComboOrderItem>();
    public DbSet<Article> Articles => Set<Article>();
    public DbSet<NotificationPreference> NotificationPreferences => Set<NotificationPreference>();
    public DbSet<Campaign> Campaigns => Set<Campaign>();
    public DbSet<DiscountCode> DiscountCodes => Set<DiscountCode>();
    public DbSet<CampaignCombo> CampaignCombos => Set<CampaignCombo>();
    public DbSet<CampaignArticle> CampaignArticles => Set<CampaignArticle>();
    public DbSet<DiscountRedemption> DiscountRedemptions => Set<DiscountRedemption>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        foreach (var e in b.Model.GetEntityTypes())
        {
            e.SetTableName(Snake(e.GetTableName()!));
            foreach (var p in e.GetProperties()) p.SetColumnName(Snake(p.Name));
        }

        GuidKey<User>(b, "users");
        GuidKey<RefreshToken>(b, "refresh_tokens");
        GuidKey<PasswordResetToken>(b, "password_reset_tokens");
        GuidKey<Movie>(b, "movies");
        GuidKey<Hall>(b, "halls");
        GuidKey<Seat>(b, "seats");
        GuidKey<Showtime>(b, "showtimes");
        GuidKey<ShowtimeSeat>(b, "showtime_seats");
        GuidKey<PricingRule>(b, "pricing_rules");
        GuidKey<Booking>(b, "bookings");
        GuidKey<BookingSeat>(b, "booking_seats");
        GuidKey<Ticket>(b, "tickets");
        GuidKey<Payment>(b, "payments");
        GuidKey<AuditLog>(b, "audit_logs");
        GuidKey<BatchJob>(b, "batch_jobs");
        GuidKey<DailyAggregate>(b, "daily_aggregates");
        GuidKey<ConcessionItem>(b, "concession_items");
        GuidKey<ComboOrder>(b, "combo_orders");
        GuidKey<ComboOrderItem>(b, "combo_order_items");
        GuidKey<Article>(b, "articles");
        GuidKey<NotificationPreference>(b, "notification_preferences");
        GuidKey<Campaign>(b, "campaigns");
        GuidKey<DiscountCode>(b, "discount_codes");
        GuidKey<DiscountRedemption>(b, "discount_redemptions");

        b.Entity<SeatBasePrice>().ToTable("seat_base_prices").HasKey(x => x.SeatType);
        b.Entity<CampaignCombo>().ToTable("campaign_combos").HasKey(x => new { x.CampaignId, x.ComboId });
        b.Entity<CampaignArticle>().ToTable("campaign_articles").HasKey(x => new { x.CampaignId, x.ArticleId });

        // Business unique keys (mirror Go partial unique indexes).
        b.Entity<User>().HasIndex(x => x.Email).IsUnique()
            .HasFilter("deleted_at IS NULL");
        b.Entity<PasswordResetToken>().HasIndex(x => x.TokenHash).IsUnique();
        b.Entity<Movie>().HasIndex(x => new { x.Status });
        b.Entity<Hall>().HasIndex(x => x.Name).IsUnique()
            .HasFilter("deleted_at IS NULL");
        b.Entity<Seat>().HasIndex(x => new { x.HallId, x.RowLabel, x.ColNumber }).IsUnique();
        b.Entity<ShowtimeSeat>().HasIndex(x => new { x.ShowtimeId, x.SeatId }).IsUnique();
        b.Entity<Booking>().HasIndex(x => x.PaymentId).IsUnique()
            .HasFilter("payment_id IS NOT NULL");
        b.Entity<Booking>().HasIndex(x => new { x.UserId, x.ShowtimeId }).IsUnique()
            .HasFilter("status = 'pending'");
        b.Entity<Booking>().HasIndex(x => x.IdempotencyKey).IsUnique()
            .HasFilter("status = 'pending' AND idempotency_key IS NOT NULL");
        b.Entity<BookingSeat>().HasIndex(x => new { x.BookingId, x.ShowtimeSeatId }).IsUnique();
        b.Entity<Ticket>().HasIndex(x => x.ShowtimeSeatId).IsUnique();
        b.Entity<Ticket>().HasIndex(x => x.Code).IsUnique();
        b.Entity<Payment>().HasIndex(x => new { x.Provider, x.TxnRef }).IsUnique();
        b.Entity<Payment>().HasIndex(x => x.BookingId).IsUnique()
            .HasFilter("status = 'paid'");
        b.Entity<DailyAggregate>().HasIndex(x => x.ReportDate).IsUnique();
        b.Entity<Article>().HasIndex(x => x.Slug).IsUnique()
            .HasFilter("deleted_at IS NULL");
        b.Entity<NotificationPreference>().HasIndex(x => x.UserId).IsUnique();
        b.Entity<DiscountCode>().HasIndex(x => x.Code).IsUnique()
            .HasFilter("deleted_at IS NULL");
        b.Entity<DiscountRedemption>().HasIndex(x => new { x.UserId, x.DiscountCodeId }).IsUnique();

        // jsonb columns.
        b.Entity<Hall>().Property(x => x.AisleAfterCols).HasColumnType("jsonb");
        b.Entity<Payment>().Property(x => x.ProviderData).HasColumnType("jsonb");
        b.Entity<AuditLog>().Property(x => x.BeforeJson).HasColumnType("jsonb");
        b.Entity<AuditLog>().Property(x => x.AfterJson).HasColumnType("jsonb");
        b.Entity<DailyAggregate>().Property(x => x.Breakdown).HasColumnType("jsonb");
    }

    private static void GuidKey<T>(ModelBuilder b, string table) where T : class
    {
        var e = b.Entity<T>();
        e.ToTable(table);
        e.Property<Guid>("Id").ValueGeneratedNever();
    }

    private static string Snake(string name)
    {
        var sb = new System.Text.StringBuilder();
        for (var i = 0; i < name.Length; i++)
        {
            var c = name[i];
            if (char.IsUpper(c)) { if (i > 0) sb.Append('_'); sb.Append(char.ToLowerInvariant(c)); }
            else sb.Append(c);
        }
        return sb.ToString();
    }
}
