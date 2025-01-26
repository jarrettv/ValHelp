
using ValHelpApi.Config;
using ValHelpApi.Modules.Admin;
using ValHelpApi.Modules.Tournament;


var builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();
builder.AddAuth();
builder.AddDatabase();
builder.Services.AddProblemDetails();
builder.Services.AddOpenApi();

var app = builder.Build();

#if DEBUG
var config = app.Configuration as IConfigurationRoot;
app.Logger.LogInformation(config?.GetDebugView());
#endif

app.UseExceptionHandler();
app.UseFileServer();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapDbEndpoints();
}
app.MapTournamentEndpoints();
app.MapDefaultEndpoints();
app.Run();