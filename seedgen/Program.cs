using SeedGen;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<SeedGenOptions>(opts =>
{
    opts.DataDir = builder.Configuration["SEEDGEN_DATA_DIR"] ?? opts.DataDir;
    opts.ServerDir = builder.Configuration["VALHEIM_SERVER_DIR"] ?? opts.ServerDir;
    opts.WorldsDir = builder.Configuration["VALHEIM_WORLDS_DIR"] ?? opts.WorldsDir;
});

builder.Services.AddSingleton<JobQueue>();
builder.Services.AddSingleton<ArtifactGenerator>();
builder.Services.AddSingleton<SeedGenWorker>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<SeedGenWorker>());

builder.Services.AddResponseCompression(opts =>
{
    opts.EnableForHttps = true;
    opts.MimeTypes = ["application/json", "application/octet-stream"];
});

builder.WebHost.UseUrls(builder.Configuration["URLS"] ?? "http://0.0.0.0:5580");

var app = builder.Build();

app.UseResponseCompression();
app.MapEndpoints();

app.Run();
