using System.Diagnostics;

namespace SeedGen;

/// <summary>
/// Generates map texture caches and BVEC from a seed using pure C# world generation.
/// </summary>
public sealed class ArtifactGenerator(ILogger<ArtifactGenerator> logger)
{
    public void GenerateAll(string seedName, int seedHash, int worldGen, string outDir,
        Vh.World.WorldGenerator? worldGenerator = null)
    {
        Directory.CreateDirectory(outDir);
        var sw = Stopwatch.StartNew();

        logger.LogInformation("Generating textures: seed={Seed} hash={Hash} worldGen={WorldGen}", seedName, seedHash, worldGen);

        var wg = worldGenerator ?? new Vh.World.WorldGenerator(seedHash, worldGen);
        int size = Vh.Rendering.MapArtifacts.Size;
        var mapPixels = Vh.Rendering.MapArtifacts.NewMap();
        var maskPixels = Vh.Rendering.MapArtifacts.NewRgba();
        var heightPixels = Vh.Rendering.MapArtifacts.NewRgba();
        // Shared with the browser build (Vh.WorldGen.Wasm), so both produce the same map.
        Vh.Rendering.MapArtifacts.FillTextures(wg, mapPixels, maskPixels, heightPixels);

        logger.LogInformation("Textures generated in {Ms}ms", sw.ElapsedMilliseconds);

        // PNGs: PngWriter flips bottom-up → standard top-down (correct for PNG)
        Vh.Rendering.PngWriter.WritePngRgb(Path.Combine(outDir, "mapTexCache"), size, size, mapPixels);
        Vh.Rendering.PngWriter.WritePngRgba(Path.Combine(outDir, "forestMaskTexCache"), size, size, maskPixels);
        Vh.Rendering.PngWriter.WritePngRgba(Path.Combine(outDir, "heightTexCache"), size, size, heightPixels);

        var bvec = Vh.Rendering.MapArtifacts.Bvec(mapPixels, maskPixels, heightPixels);
        File.WriteAllBytes(Path.Combine(outDir, "bvec"), bvec);

        logger.LogInformation("All artifacts in {Ms}ms — BVEC {Bytes:N0}", sw.ElapsedMilliseconds, bvec.Length);
    }
}
