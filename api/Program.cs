using System.Threading.Channels;
using ValHelpApi.Config;
using ValHelpApi.ModuleAdmin;
using ValHelpApi.ModuleEvents;
using ValHelpApi.ModuleTrack;


var builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();
builder.AddAuth();
builder.AddDatabase();
builder.Services.AddHybridCache();
builder.Services.AddProblemDetails();
builder.Services.AddOpenApi();
builder.Services.AddSingleton(x => Channel.CreateUnbounded<TrackLog>());
builder.Services.AddSingleton(x => Channel.CreateUnbounded<TrackHunt>());
builder.Services.AddHostedService<EventsStatusUpdater>();
builder.Services.AddHostedService<EventsSeedMaker>();
builder.Services.AddHostedService<TrackLogTracker>();
builder.Services.AddHostedService<TrackHuntTracker>();

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowLocalhost5173", policy =>
    {
        policy.WithOrigins("http://localhost:5173")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

var app = builder.Build();
app.UseCors("AllowLocalhost5173");
app.UseAuthentication();
app.UseAuthorization();
app.UseExceptionHandler();
app.MapStaticAssets();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}
app.MapDbEndpoints();
app.MapEventsEndpoints();
app.MapAvatarEndpoints();
app.MapAuthEndpoints();
app.MapDefaultEndpoints();
app.MapFallbackToFile("index.html");
app.Run();
