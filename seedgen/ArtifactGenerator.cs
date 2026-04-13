using System.Diagnostics;

namespace SeedGen;

/// <summary>
/// Generates map texture caches and BVEC from a seed using pure C# world generation.
/// </summary>
public sealed class ArtifactGenerator(ILogger<ArtifactGenerator> logger)
{
    public void GenerateAll(string seedName, int seedHash, int worldGen, string outDir)
    {
        Directory.CreateDirectory(outDir);
        var sw = Stopwatch.StartNew();

        logger.LogInformation("Generating textures: seed={Seed} hash={Hash} worldGen={WorldGen}", seedName, seedHash, worldGen);

        var wg = new Vh.World.WorldGenerator(seedHash, worldGen);
        int size = Vh.Rendering.MinimapGenerator.TextureSize;
        float pixelSize = Vh.Rendering.MinimapGenerator.PixelSize;
        int center = size / 2;
        float halfPixel = pixelSize / 2f;

        var mapPixels = new byte[size * size * 3];
        var maskPixels = new byte[size * size * 4];
        var heightPixels = new byte[size * size * 4];
        const float heightScale = 127.5f;

        for (int i = 0; i < size; i++)
        {
            for (int j = 0; j < size; j++)
            {
                float wx = (j - center) * pixelSize + halfPixel;
                float wy = (i - center) * pixelSize + halfPixel;

                var biome = wg.GetBiome(wx, wy);
                float biomeHeight = wg.GetBiomeHeight(biome, wx, wy, out _, out _, out _, out _);

                var (cr, cg, cb) = Vh.Rendering.MinimapGenerator.GetPixelColor(biome);
                int idx3 = (i * size + j) * 3;
                mapPixels[idx3] = cr;
                mapPixels[idx3 + 1] = cg;
                mapPixels[idx3 + 2] = cb;

                var mask = Vh.Rendering.MinimapGenerator.GetMaskColor(wg, wx, wy, biomeHeight, biome);
                int idx4 = (i * size + j) * 4;
                maskPixels[idx4] = Q4(mask.r);
                maskPixels[idx4 + 1] = Q4(mask.g);
                maskPixels[idx4 + 2] = Q4(mask.b);
                maskPixels[idx4 + 3] = Q4(mask.a);

                int h16 = Math.Clamp((int)(biomeHeight * heightScale), 0, 65025);
                heightPixels[idx4] = (byte)(h16 >> 8);
                heightPixels[idx4 + 1] = (byte)(h16 & 0xFF);
                heightPixels[idx4 + 2] = 0;
                heightPixels[idx4 + 3] = 255;
            }
        }

        logger.LogInformation("Textures generated in {Ms}ms", sw.ElapsedMilliseconds);

        // PNGs: PngWriter flips bottom-up → standard top-down (correct for PNG)
        Vh.Rendering.PngWriter.WritePngRgb(Path.Combine(outDir, "mapTexCache"), size, size, mapPixels);
        Vh.Rendering.PngWriter.WritePngRgba(Path.Combine(outDir, "forestMaskTexCache"), size, size, maskPixels);
        Vh.Rendering.PngWriter.WritePngRgba(Path.Combine(outDir, "heightTexCache"), size, size, heightPixels);

        // BVEC: BiomeExtractor expects top-down pixels (as decoded from standard PNGs).
        // Raw arrays are bottom-up (row 0 = south), so flip before extraction.
        FlipVertical(mapPixels, size, size, 3);
        FlipVertical(heightPixels, size, size, 4);
        FlipVertical(maskPixels, size, size, 4);

        var bvecRaw = ValHelpApi.ModuleTrack.Rendering.BiomeExtractor.ExtractBinary(
            mapPixels, size, size, heightPixels, size, size, maskPixels, size, size,
            ValHelpApi.ModuleTrack.Rendering.BiomeExtractor.ExtractionMode.V4HiFi);
        var bvecCompressed = ValHelpApi.ModuleTrack.Rendering.BvecCompressor.CompressV3(bvecRaw);
        File.WriteAllBytes(Path.Combine(outDir, "bvec"), bvecCompressed);

        logger.LogInformation("All artifacts in {Ms}ms — BVEC {Raw:N0} → {Comp:N0}",
            sw.ElapsedMilliseconds, bvecRaw.Length, bvecCompressed.Length);
    }

    static byte Q4(float f) => (byte)(Math.Clamp((int)(f * 15f + 0.5f), 0, 15) * 17);

    static void FlipVertical(byte[] pixels, int width, int height, int bpp)
    {
        int rowBytes = width * bpp;
        var temp = new byte[rowBytes];
        for (int y = 0; y < height / 2; y++)
        {
            int top = y * rowBytes;
            int bot = (height - 1 - y) * rowBytes;
            Buffer.BlockCopy(pixels, top, temp, 0, rowBytes);
            Buffer.BlockCopy(pixels, bot, pixels, top, rowBytes);
            Buffer.BlockCopy(temp, 0, pixels, bot, rowBytes);
        }
    }
}
