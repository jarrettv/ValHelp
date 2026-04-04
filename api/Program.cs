using System.Threading.Channels;
using ValHelpApi.Config;
using ValHelpApi.ModuleAdmin;
using ValHelpApi.ModuleEvents;
using ValHelpApi.ModuleRuns;
using ValHelpApi.ModuleSeries;
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
builder.Services.AddSingleton<PathStore>();
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
app.MapStaticAssets().ShortCircuit();
app.UseAuthentication();
app.UseAuthorization();
if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
    app.MapOpenApi();
}
else
{
    app.UseExceptionHandler();
}
app.MapEndpointsAdmin();
app.MapEndpointsEvents();
app.MapEndpointsRuns();
app.MapEndpointsSeries();
app.MapEndpointsTrack();
app.MapDefaultEndpoints();
app.MapFallbackToFile("index.html");
app.Run();
