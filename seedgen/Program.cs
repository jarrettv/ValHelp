using SeedGen;

// Dev: `dungeon-check <oracle.loot.json> <seed>` / `pois-check <db2> <seed> <oracle.loot.json>`
// compare DungeonSim with an oracle dump (see WorldGen/DungeonCheck.cs).
if (args.Length > 0 && args[0] == "dungeon-check") return Vh.World.DungeonCheck.Run(args[1..]);
if (args.Length > 0 && args[0] == "pois-check") return Vh.World.DungeonCheck.RunPois(args[1..]);
// Dev: `prefab-types` prints every POI prefab with its type and name (scripts/export_poi_catalog.py).
if (args.Length > 0 && args[0] == "prefab-types")
{
    Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(Vh.World.LocationFinder.KnownPrefabs()
        .Select(p => new { prefab = p.Prefab, type = p.Type, name = p.Name, inside = p.Inside })));
    return 0;
}

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
    opts.MimeTypes = ["application/json", "application/octet-stream", "image/png"];
});

builder.WebHost.UseUrls(builder.Configuration["URLS"] ?? "http://0.0.0.0:5580");

var app = builder.Build();

app.UseResponseCompression();
app.MapEndpoints();

app.Run();
return 0;
