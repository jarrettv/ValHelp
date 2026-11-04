using System.Threading.Channels;
using ValHelpApi.Config;
using ValHelpApi.ModuleAdmin;
using ValHelpApi.ModuleCharacters;
using ValHelpApi.ModuleEvents;
using ValHelpApi.ModuleRuns;
using ValHelpApi.ModuleSeries;
using ValHelpApi.ModuleStuff;
using ValHelpApi.ModuleTrack;
using ValHelpApi.ModuleWorlds;


var builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();
builder.AddAuth();
builder.AddDatabase();
builder.Services.AddHybridCache();
builder.Services.AddProblemDetails();
builder.Services.AddOpenApi();
builder.Services.AddHttpClient();
builder.Services.AddSingleton(x => Channel.CreateUnbounded<TrackLog>());
builder.Services.AddSingleton(x => Channel.CreateUnbounded<TrackHunt>());
builder.Services.AddSingleton<PathStore>();
builder.Services.AddHostedService<EventsStatusUpdater>();
builder.Services.AddHostedService<EventsSeedMaker>();
builder.Services.AddHostedService<TrackLogTracker>();
builder.Services.AddHostedService<TrackHuntTracker>();
WorldsEvents.AddRateLimit(builder.Services);

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
app.MapStaticAssets().ShortCircuit();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
app.UseExceptionHandler();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}
app.MapEndpointsAdmin();
app.MapEndpointsCharacters();
app.MapEndpointsEvents();
app.MapEndpointsRuns();
app.MapEndpointsSeries();
app.MapEndpointsStuff();
app.MapEndpointsTrack();
app.MapEndpointsWorlds();
app.MapDefaultEndpoints();
// A download that isn't there is a 404, not the SPA's index.html saved as the file.
app.MapGet("downloads/{**path}", () => Results.NotFound());
app.MapFallbackToFile("index.html");
app.Run();
