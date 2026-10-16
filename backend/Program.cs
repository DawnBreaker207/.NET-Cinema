using System.Text;
using System.Threading.RateLimiting;
using Cinema.Api.Common;
using Cinema.Api.Data;
using Cinema.Api.Middleware;
using Cinema.Api.Services;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// EF Core maps the existing Go-migrated schema; it never manages schema.
builder.Services.AddDbContext<CinemaDbContext>(o => o.UseNpgsql(
    builder.Configuration.GetConnectionString("CinemaDb"),
    npg => npg.MigrationsHistoryTable("__ef_not_used")));

builder.Services.AddSingleton<JwtService>();
builder.Services.AddSingleton<LoginLockout>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<CatalogService>();
builder.Services.AddScoped<HallService>();
builder.Services.AddScoped<ShowService>();
builder.Services.AddSingleton<SseHub>();
builder.Services.AddScoped<BookingService>();
builder.Services.AddScoped<PaymentService>();
builder.Services.AddScoped<EmailService>();
builder.Services.AddScoped<ComboService>();
builder.Services.AddScoped<ArticleService>();
builder.Services.AddScoped<CampaignService>();
builder.Services.AddScoped<AdminService>();
builder.Services.AddScoped<StaffService>();
builder.Services.AddScoped<BatchJobs>();
builder.Services.AddScoped<AuditFilter>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddHostedService<JobsHostedService>();
builder.Services.AddHttpClient();
builder.Services.AddScoped<PricingService>();

builder.Services.AddControllersWithViews(o =>
{
    o.RespectBrowserAcceptHeader = true; // same action can serve view or JSON
    o.Filters.AddService<AuditFilter>();
}).AddJsonOptions(o =>
{
    o.JsonSerializerOptions.PropertyNamingPolicy = SnakeCaseNamingPolicy.Instance;
    o.JsonSerializerOptions.DictionaryKeyPolicy = SnakeCaseNamingPolicy.Instance;
    o.JsonSerializerOptions.DefaultIgnoreCondition =
        System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull;
});

// JWT access tokens (HS256, claims uid/email/role/typ) — same format as Go.
var accessSecret = builder.Configuration["Jwt:AccessSecret"]!;
// "Smart" default: React sends Authorization: Bearer -> JWT;
// Razor Ajax (same-origin, cookie only) -> Web cookie. One API, both clients.
builder.Services.AddAuthentication("Smart")
    .AddPolicyScheme("Smart", "Smart", o =>
    {
        o.ForwardDefaultSelector = ctx =>
            ctx.Request.Headers.ContainsKey("Authorization")
                ? JwtBearerDefaults.AuthenticationScheme
                : "Web";
        o.ForwardChallenge = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(o =>
    {
        o.MapInboundClaims = false;
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = false,
            ValidateAudience = false,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30),
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(accessSecret)),
            RoleClaimType = "role",
            NameClaimType = "uid",
        };
        o.Events = new JwtBearerEvents
        {
            OnChallenge = ctx =>
            {
                ctx.HandleResponse();
                ctx.Response.StatusCode = 401;
                ctx.Response.ContentType = "application/json";
                return ctx.Response.WriteAsync("""{"code":40100,"message":"unauthorized","reason":"unauthorized"}""");
            },
            OnForbidden = ctx =>
            {
                ctx.Response.StatusCode = 403;
                ctx.Response.ContentType = "application/json";
                return ctx.Response.WriteAsync("""{"code":40300,"message":"forbidden","reason":"forbidden"}""");
            }
        };
    });
// Web (MVC/Razor) session auth — same user store as the JSON API.
builder.Services.AddAuthentication().AddCookie("Web", o =>
    {
        o.LoginPath = "/account/login";
        o.LogoutPath = "/account/logout";
        o.AccessDeniedPath = "/account/denied";
        o.Cookie.Name = "cinema.web";
        o.Cookie.HttpOnly = true;
        o.SlidingExpiration = true;
        o.ExpireTimeSpan = TimeSpan.FromHours(12);
    });
builder.Services.AddAuthorization();

// Rate limits mirror Go in-memory buckets: /auth, /orders/hold, public catalog.
var rl = builder.Configuration.GetSection("RateLimit");
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = 429;
    o.AddPolicy("auth", c => RateLimitPartition.GetTokenBucketLimiter("auth",
        _ => new TokenBucketRateLimiterOptions
        {
            TokenLimit = rl.GetValue("AuthPermitLimit", 60),
            ReplenishmentPeriod = TimeSpan.FromSeconds(rl.GetValue("AuthWindowSeconds", 60)),
            TokensPerPeriod = rl.GetValue("AuthPermitLimit", 60)
        }));
    o.AddPolicy("hold", c => RateLimitPartition.GetTokenBucketLimiter("hold",
        _ => new TokenBucketRateLimiterOptions
        {
            TokenLimit = rl.GetValue("HoldPermitLimit", 30),
            ReplenishmentPeriod = TimeSpan.FromSeconds(rl.GetValue("HoldWindowSeconds", 60)),
            TokensPerPeriod = rl.GetValue("HoldPermitLimit", 30)
        }));
    o.AddPolicy("public", c => RateLimitPartition.GetTokenBucketLimiter("public",
        _ => new TokenBucketRateLimiterOptions
        {
            TokenLimit = rl.GetValue("PublicPermitLimit", 120),
            ReplenishmentPeriod = TimeSpan.FromSeconds(rl.GetValue("PublicWindowSeconds", 60)),
            TokensPerPeriod = rl.GetValue("PublicPermitLimit", 120)
        }));
});

builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [])
    .AllowAnyHeader().AllowAnyMethod()));

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new Microsoft.OpenApi.Models.OpenApiInfo
    {
        Title = "Cinema Project API",
        Version = "v1",
        Description = "ASP.NET Core 8 RESTful API for Cinema System (Ported 1:1 from Go)"
    });

    c.AddSecurityDefinition("Bearer", new Microsoft.OpenApi.Models.OpenApiSecurityScheme
    {
        Description = "Nhập JWT token theo định dạng: Bearer {token}",
        Name = "Authorization",
        In = Microsoft.OpenApi.Models.ParameterLocation.Header,
        Type = Microsoft.OpenApi.Models.SecuritySchemeType.ApiKey,
        Scheme = "Bearer"
    });

    c.AddSecurityRequirement(new Microsoft.OpenApi.Models.OpenApiSecurityRequirement
    {
        {
            new Microsoft.OpenApi.Models.OpenApiSecurityScheme
            {
                Reference = new Microsoft.OpenApi.Models.OpenApiReference
                {
                    Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });

    var xmlFile = $"{System.Reflection.Assembly.GetExecutingAssembly().GetName().Name}.xml";
    var xmlPath = Path.Combine(AppContext.BaseDirectory, xmlFile);
    if (File.Exists(xmlPath))
    {
        c.IncludeXmlComments(xmlPath);
    }
});

var app = builder.Build();

// Auto-apply pending EF Core migrations on startup and seed initial data if empty
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<CinemaDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    try
    {
        if (db.Database.GetPendingMigrations().Any())
        {
            logger.LogInformation("Applying pending EF Core migrations...");
            db.Database.Migrate();
            logger.LogInformation("EF Core migrations applied successfully.");
        }

        // Seed initial data if database is empty
        if (!db.Users.Any())
        {
            var seedDir = Path.Combine(app.Environment.ContentRootPath, "database", "seed");
            if (Directory.Exists(seedDir))
            {
                logger.LogInformation("Seeding initial data from {Path}...", seedDir);
                foreach (var file in Directory.GetFiles(seedDir, "*.sql").OrderBy(f => f))
                {
                    var sql = File.ReadAllText(file);
                    db.Database.ExecuteSqlRaw(sql);
                }
                logger.LogInformation("Database seeded successfully.");
            }
        }
    }
    catch (Exception ex)
    {
        logger.LogWarning("Automatic migration/seed check note: {Message}", ex.Message);
    }
}

app.UseMiddleware<ApiExceptionMiddleware>();
app.UseStaticFiles();
app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseMiddleware<AccountStatusMiddleware>();
app.UseAuthorization();

// Enable Swagger in dev or when requested
app.UseSwagger();
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "Cinema Project API v1");
    c.RoutePrefix = "swagger";
});

app.MapControllers(); // attribute routes: /api/v1/* JSON + MVC actions
app.MapControllerRoute("default", "{controller=Home}/{action=Index}/{id?}");

app.Run();
