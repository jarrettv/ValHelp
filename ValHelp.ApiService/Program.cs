
using ValHelp.ApiService.Config;
using ValHelp.ApiService.Modules.Admin;
using ValHelp.ApiService.Modules.Tournament;


var builder = WebApplication.CreateBuilder(args);

// Add service defaults & Aspire client integrations.
builder.AddServiceDefaults();

builder.AddDatabase();

// Add services to the container.
builder.Services.AddProblemDetails();

// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();


var app = builder.Build();

var config = app.Configuration as IConfigurationRoot;
app.Logger.LogInformation(config?.GetDebugView());
// Configure the HTTP request pipeline.
app.UseExceptionHandler();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.MapTournamentEndpoints();
app.MapDbEndpoints();
app.MapDefaultEndpoints();

app.Run();