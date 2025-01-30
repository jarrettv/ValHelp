
using ValHelpApi.Config;
using ValHelpApi.Modules.Admin;
using ValHelpApi.Modules.Tournament;


var builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();
builder.AddAuth();
builder.AddDatabase();
builder.Services.AddProblemDetails();
builder.Services.AddOpenApi();

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
app.UseFileServer();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapDbEndpoints();
}
app.MapTournamentEndpoints();
app.MapAuthEndpoints();
app.MapDefaultEndpoints();
app.Run();