using System;
using System.IO;

namespace Vh.Rendering;
using Vh.World;

/// <summary>
/// Generates the three minimap texture cache files exactly as Valheim's Minimap.GenerateWorldMap() does.
/// </summary>
public static class MinimapGenerator
{
    // Minimap settings - both textureSize and pixelSize are overridden by the Unity prefab.
    // C# defaults are textureSize=256, pixelSize=64, but the prefab sets them to 2048 and 12.
    public const int TextureSize = 2048;
    public const float PixelSize = 12f;

    // Biome colors - exact byte values from the game's actual mapTexCache PNG.
    // The Unity prefab overrides the C# default Color fields.
    private static readonly (byte r, byte g, byte b) MeadowsColor = (146, 167, 92);
    private static readonly (byte r, byte g, byte b) AshlandsColor = (123, 32, 32);
    private static readonly (byte r, byte g, byte b) BlackForestColor = (107, 116, 63);
    private static readonly (byte r, byte g, byte b) DeepNorthColor = (255, 255, 255);
    private static readonly (byte r, byte g, byte b) PlainsColor = (231, 171, 120);
    private static readonly (byte r, byte g, byte b) SwampColor = (163, 114, 88);
    private static readonly (byte r, byte g, byte b) MountainColor = (255, 255, 255);
    private static readonly (byte r, byte g, byte b) MistlandsColor = (51, 51, 51);
    private static readonly (byte r, byte g, byte b) OceanColor = (255, 255, 255);

    public static (byte r, byte g, byte b) GetPixelColor(Biome biome)
    {
        return biome switch
        {
            Biome.Meadows => MeadowsColor,
            Biome.AshLands => AshlandsColor,
            Biome.BlackForest => BlackForestColor,
            Biome.DeepNorth => DeepNorthColor,
            Biome.Plains => PlainsColor,
            Biome.Swamp => SwampColor,
            Biome.Mountain => MountainColor,
            Biome.Mistlands => MistlandsColor,
            Biome.Ocean => OceanColor,
            _ => OceanColor,
        };
    }

    public static (float r, float g, float b, float a) GetMaskColor(WorldGenerator wg, float wx, float wy, float biomeHeight, Biome biome)
    {
        float r = 0, g = 0, b = 0, a = 0;

        if (biomeHeight < 30f)
        {
            b = Math.Clamp(WorldGenerator.GetAshlandsOceanGradient(wx, wy), 0f, 1f);
            return (r, g, b, a);
        }

        switch (biome)
        {
            case Biome.Meadows:
                r = WorldGenerator.InForest(new Vector3(wx, 0f, wy)) ? 1f : 0f;
                break;
            case Biome.Plains:
                r = WorldGenerator.GetForestFactor(new Vector3(wx, 0f, wy)) < 0.8f ? 1f : 0f;
                break;
            case Biome.BlackForest:
                r = 1f;
                break;
            case Biome.Mistlands:
            {
                float ff = WorldGenerator.GetForestFactor(new Vector3(wx, 0f, wy));
                // Game uses Utils.SmoothStep (float precision), not DUtils.SmoothStep (double)
                g = 1f - DUtils.SmoothStepFloat(1.1f, 1.3f, ff);
                break;
            }
            case Biome.AshLands:
            {
                // Game calls GetAshlandsHeight(cheap: true) for the mask — fewer noise iterations
                b = wg.GetAshlandsLavaMask(wx, wy);
                break;
            }
        }

        return (r, g, b, a);
    }

    /// <summary>
    /// Generate all three texture caches and save them as PNG files.
    /// </summary>
    public static void Generate(WorldGenerator wg, string outputDir, string worldFileName)
    {
        Console.WriteLine("Generating minimap textures...");
        var sw = System.Diagnostics.Stopwatch.StartNew();

        int size = TextureSize;
        int center = size / 2;
        float halfPixel = PixelSize / 2f;

        // mapTexCache: RGB24 - biome colors
        byte[] mapPixels = new byte[size * size * 3];
        // forestMaskTexCache: RGBA32 - forest/mask data
        byte[] maskPixels = new byte[size * size * 4];
        // heightTexCache: RGBA32 (16-bit height encoded in R,G; B=0, A=255)
        byte[] heightPixels = new byte[size * size * 4];

        float heightScale = 127.5f;

        for (int i = 0; i < size; i++)
        {
            if (i % 64 == 0)
                Console.Write($"\r  Row {i}/{size}...");

            for (int j = 0; j < size; j++)
            {
                float wx = (j - center) * PixelSize + halfPixel;
                float wy = (i - center) * PixelSize + halfPixel;

                Biome biome = wg.GetBiome(wx, wy);
                float biomeHeight = wg.GetBiomeHeight(biome, wx, wy, out _, out _, out _, out _);

                // Map texture (biome colors)
                var (cr, cg, cb) = GetPixelColor(biome);
                int idx3 = (i * size + j) * 3;
                mapPixels[idx3] = cr;
                mapPixels[idx3 + 1] = cg;
                mapPixels[idx3 + 2] = cb;

                // Forest mask texture
                var mask = GetMaskColor(wg, wx, wy, biomeHeight, biome);
                int idx4 = (i * size + j) * 4;
                // Game uses RGBA4444 (4 bits per channel, 16 levels: 0,17,34,...,255).
                // Quantize float -> 4-bit -> expand to 8-bit to match game's output exactly.
                maskPixels[idx4] = Quantize4bit(mask.r);
                maskPixels[idx4 + 1] = Quantize4bit(mask.g);
                maskPixels[idx4 + 2] = Quantize4bit(mask.b);
                maskPixels[idx4 + 3] = Quantize4bit(mask.a);

                // Height texture (16-bit encoded in R,G channels, B=0, A=255)
                int h16 = Math.Clamp((int)(biomeHeight * heightScale), 0, 65025);
                heightPixels[idx4] = (byte)(h16 >> 8);
                heightPixels[idx4 + 1] = (byte)(h16 & 0xFF);
                heightPixels[idx4 + 2] = 0;
                heightPixels[idx4 + 3] = 255;
            }
        }
        Console.WriteLine($"\r  Generation complete.");

        // Save PNGs
        string mapPath = Path.Combine(outputDir, worldFileName + "_mapTexCache");
        string maskPath = Path.Combine(outputDir, worldFileName + "_forestMaskTexCache");
        string heightPath = Path.Combine(outputDir, worldFileName + "_heightTexCache");

        PngWriter.WritePngRgb(mapPath, size, size, mapPixels);
        PngWriter.WritePngRgba(maskPath, size, size, maskPixels);
        PngWriter.WritePngRgba(heightPath, size, size, heightPixels);

        sw.Stop();
        Console.WriteLine($"Saved textures in {sw.ElapsedMilliseconds}ms:");
        Console.WriteLine($"  {mapPath}");
        Console.WriteLine($"  {maskPath}");
        Console.WriteLine($"  {heightPath}");
    }

    /// <summary>
    /// Quantize a [0,1] float to 4-bit precision, expanded to 8-bit byte.
    /// Matches Unity's RGBA4444 texture format: float → 4-bit (0-15) → byte (0,17,34,...,255).
    /// </summary>
    private static byte Quantize4bit(float f)
    {
        int v4 = Math.Clamp((int)(f * 15f + 0.5f), 0, 15);
        return (byte)(v4 * 17);
    }

}
