
using ValHelp.ApiService.Config;
using ValHelp.ApiService.Modules.Admin;
using ValHelp.ApiService.Modules.Tournament;


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

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapDbEndpoints();
}
app.MapTournamentEndpoints();
app.MapDefaultEndpoints();

app.Run();