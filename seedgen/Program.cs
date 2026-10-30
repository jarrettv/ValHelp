using SeedGen;

// Dev: `dungeon-check <oracle.loot.json> <seed>` / `pois-check <db2> <seed> <oracle.loot.json>`
// compare DungeonSim with an oracle dump (see WorldGen/DungeonCheck.cs).
if (args.Length > 0 && args[0] == "dungeon-check") return Vh.World.DungeonCheck.Run(args[1..]);
if (args.Length > 0 && args[0] == "pois-check") return Vh.World.DungeonCheck.RunPois(args[1..]);
if (args.Length > 0 && args[0] == "contents-check") return Vh.World.DungeonCheck.RunContents(args[1..]);
// Dev: `chests-check <dir> [seeds]` places each seed*/ dir's world as the browser does
// (no saved world, no oracle) and compares the POIs' simulated chests with its oracle.loot.json.
if (args.Length > 0 && args[0] == "chests-check") return Vh.World.DungeonCheck.RunChests(args[1..]);
// Dev: `pois-json <db> <SeedName> [oracle.loot.json]` prints the POIs a job would serve.
if (args.Length > 0 && args[0] == "pois-json")
{
    int seed = SeedGen.ValheimSeedHash.GetStableHashCode(args[2]);
    var loot = args.Length > 3 ? Vh.World.LocationFinder.LoadLoot(args[3]) : null;
    var pois = Vh.World.LocationFinder.ReadFromWorldDb(args[1], seed, out _, new Vh.World.WorldGenerator(seed, 2), loot);
    Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(pois, SeedGen.Json.CamelCase));
    return 0;
}
// Dev: `grid-dump <SeedName> <dir> [worldGenVersion]` writes our height.f32 / biome.u8 / forest.f32
// in the oracle's layout (scripts/compare_oracle.py --ours <dir>).
if (args.Length > 0 && args[0] == "grid-dump")
{
    int seed = SeedGen.ValheimSeedHash.GetStableHashCode(args[1]);
    var grid = Vh.World.WorldGrid.GenerateParallel(seed, args.Length > 3 ? int.Parse(args[3]) : 2);
    Directory.CreateDirectory(args[2]);
    File.WriteAllBytes(Path.Combine(args[2], "height.f32"), System.Runtime.InteropServices.MemoryMarshal.AsBytes(grid.Height.AsSpan()).ToArray());
    File.WriteAllBytes(Path.Combine(args[2], "biome.u8"), grid.Biome);
    File.WriteAllBytes(Path.Combine(args[2], "forest.f32"), System.Runtime.InteropServices.MemoryMarshal.AsBytes(grid.Forest.AsSpan()).ToArray());
    return 0;
}
// Dev: `map-bvec <SeedName> <file>` writes the seed's compressed vector map, as a job does
// (timings to stdout), to compare with the browser build's (Vh.WorldGen.Wasm).
if (args.Length > 0 && args[0] == "map-bvec")
{
    var sw = System.Diagnostics.Stopwatch.StartNew();
    var wg = new Vh.World.WorldGenerator(SeedGen.ValheimSeedHash.GetStableHashCode(args[1]), 2);
    long tGen = sw.ElapsedMilliseconds;
    var (map, mask, height) = (Vh.Rendering.MapArtifacts.NewMap(), Vh.Rendering.MapArtifacts.NewRgba(), Vh.Rendering.MapArtifacts.NewRgba());
    Vh.Rendering.MapArtifacts.FillTextures(wg, map, mask, height);
    long tTex = sw.ElapsedMilliseconds;
    File.WriteAllBytes(args[2], Vh.Rendering.MapArtifacts.Bvec(map, mask, height));
    Console.WriteLine($"generator {tGen} ms, textures {tTex - tGen} ms, bvec {sw.ElapsedMilliseconds - tTex} ms");
    return 0;
}
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
