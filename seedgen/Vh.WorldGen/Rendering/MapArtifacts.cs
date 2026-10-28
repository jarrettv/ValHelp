using ValHelpApi.ModuleTrack.Rendering;
using Vh.World;

namespace Vh.Rendering;

/// <summary>
/// A seed's map, as seedgen serves it: the three 2048² textures (biome colours,
/// forest/mask, height) and the compressed vector map (bvec) the web map draws.
/// The same code runs on the server (seedgen's ArtifactGenerator) and in the
/// browser (Vh.WorldGen.Wasm), so both produce the same bytes.
///
/// Textures are bottom-up (row 0 = south), as PngWriter expects. Rows are
/// independent, so <see cref="FillTextures"/> can be split across threads or
/// Web Workers, each with its own <see cref="WorldGenerator"/>.
/// </summary>
public static class MapArtifacts
{
    public const int Size = MinimapGenerator.TextureSize;

    public static byte[] NewMap() => new byte[Size * Size * 3];
    public static byte[] NewRgba() => new byte[Size * Size * 4];

    /// <summary>Biome colour (RGB), forest/mask (RGBA, 4-bit levels) and height (16-bit in RG) for rows
    /// rowFrom..rowTo; <paramref name="grid"/>, if given, also gets each cell's height and biome
    /// (what location placement's biome data is built from), at no extra cost.</summary>
    public static void FillTextures(WorldGenerator wg, byte[] map, byte[] mask, byte[] height, int rowFrom = 0, int rowTo = Size,
        WorldGrid? grid = null)
    {
        float pixelSize = MinimapGenerator.PixelSize;
        int center = Size / 2;
        float halfPixel = pixelSize / 2f;
        const float heightScale = 127.5f;

        for (int i = rowFrom; i < rowTo; i++)
        {
            for (int j = 0; j < Size; j++)
            {
                float wx = (j - center) * pixelSize + halfPixel;
                float wy = (i - center) * pixelSize + halfPixel;

                var biome = wg.GetBiome(wx, wy);
                float biomeHeight = wg.GetBiomeHeight(biome, wx, wy, out _, out _, out _, out _);

                if (grid != null)
                {
                    grid.Height[i * Size + j] = biomeHeight;
                    grid.Biome[i * Size + j] = WorldGrid.BiomeIndex(biome);
                }

                var (cr, cg, cb) = MinimapGenerator.GetPixelColor(biome);
                int idx3 = (i * Size + j) * 3;
                map[idx3] = cr;
                map[idx3 + 1] = cg;
                map[idx3 + 2] = cb;

                var m = MinimapGenerator.GetMaskColor(wg, wx, wy, biomeHeight, biome);
                int idx4 = (i * Size + j) * 4;
                mask[idx4] = Q4(m.r);
                mask[idx4 + 1] = Q4(m.g);
                mask[idx4 + 2] = Q4(m.b);
                mask[idx4 + 3] = Q4(m.a);

                int h16 = Math.Clamp((int)(biomeHeight * heightScale), 0, 65025);
                height[idx4] = (byte)(h16 >> 8);
                height[idx4 + 1] = (byte)(h16 & 0xFF);
                height[idx4 + 2] = 0;
                height[idx4 + 3] = 255;
            }
        }
    }

    /// <summary>The compressed vector map from the full textures (left untouched).</summary>
    public static byte[] Bvec(byte[] map, byte[] mask, byte[] height)
    {
        // BiomeExtractor wants top-down pixels (as decoded from PNGs); ours are bottom-up.
        var mapTd = FlippedCopy(map, 3);
        var heightTd = FlippedCopy(height, 4);
        var maskTd = FlippedCopy(mask, 4);
        var raw = BiomeExtractor.ExtractBinary(mapTd, Size, Size, heightTd, Size, Size, maskTd, Size, Size,
            BiomeExtractor.ExtractionMode.V4HiFi);
        return BvecCompressor.CompressV3(raw);
    }

    static byte Q4(float f) => (byte)(Math.Clamp((int)(f * 15f + 0.5f), 0, 15) * 17);

    static byte[] FlippedCopy(byte[] pixels, int bpp)
    {
        var o = new byte[pixels.Length];
        int rowBytes = Size * bpp;
        for (int y = 0; y < Size; y++)
            Buffer.BlockCopy(pixels, y * rowBytes, o, (Size - 1 - y) * rowBytes, rowBytes);
        return o;
    }
}
