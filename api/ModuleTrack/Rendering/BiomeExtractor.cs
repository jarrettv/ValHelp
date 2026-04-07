using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace ValHelpApi.ModuleTrack.Rendering;

/// <summary>
/// Extracts biome regions as vector polygons from the map texture.
/// Downsamples, quantizes colors, traces boundaries via marching squares.
/// Outputs binary or JSON suitable for Canvas 2D rendering.
/// </summary>
public static class BiomeExtractor
{
    const int QuantShift = 4; // >>4 = 16 levels per channel
    const float SimplifyEps = 0.4f;
    const int MinComponentPixels = 80;

    const float WaterThreshold = 29.0f;

    // ── Layer type IDs for binary format ─────────────────────────────
    const byte TypeDepth = 0;
    const byte TypeLand = 1;
    const byte TypeElevation = 2;
    const byte TypeBiome = 3;
    const byte TypeForest = 4;
    const byte TypeMist = 5;
    const byte TypeLava = 6;
    const byte TypeContourMinor = 7;
    const byte TypeContourMajor = 8;

    // ── Internal data structures ─────────────────────────────────────

    struct LayerData
    {
        public byte Type;
        public byte R, G, B;
        public List<float[]> Polygons;
    }

    struct ContourData
    {
        public float Height;
        public bool Major;
        public List<float[]> Lines;
    }

    // ── Core extraction (shared between JSON and binary) ─────────────

    static (int gridSize, List<LayerData> layers, List<ContourData> contours) Extract(
        byte[] mapPx, int srcW, int srcH,
        byte[]? heightPx, int heightW, int heightH,
        byte[]? maskPx, int maskW, int maskH)
    {
        int W = srcW, H = srcH;
        byte[] grid = mapPx;

        // Decode height field
        float[]? heights = null;
        if (heightPx != null && heightW > 0 && heightH > 0)
        {
            heights = new float[heightW * heightH];
            for (int y = 0; y < heightH; y++)
                for (int x = 0; x < heightW; x++)
                {
                    int idx = (y * heightW + x) * 4;
                    heights[y * heightW + x] = (heightPx[idx] * 256 + heightPx[idx + 1]) / 127.5f;
                }

            if (heightW != W || heightH != H)
            {
                W = Math.Min(W, heightW);
                H = Math.Min(H, heightH);
            }
        }

        var layers = new List<LayerData>();

        // ── Land / water polygons from height ─────────────────────────
        if (heights != null)
        {
            float hMin = float.MaxValue, hMax = float.MinValue;
            int waterPx = 0;
            for (int i = 0; i < W * H; i++)
            {
                if (heights[i] < hMin) hMin = heights[i];
                if (heights[i] > hMax) hMax = heights[i];
                if (heights[i] < WaterThreshold) waterPx++;
            }
            Console.WriteLine($"[BiomeExtractor] height range: {hMin:F1} to {hMax:F1}, water: {waterPx}/{W * H} ({100.0 * waterPx / (W * H):F1}%)");

            // Water depth bands
            float[] depthThresholds = { 10f, 17f, 23f };
            byte[][] depthColors = { new byte[]{0x17,0x38,0x5a}, new byte[]{0x1c,0x40,0x60}, new byte[]{0x21,0x48,0x68} };
            for (int d = 0; d < depthThresholds.Length; d++)
            {
                var polys = TraceField(heights, W, H, depthThresholds[d], 0.1f);
                if (polys.Count > 0)
                    layers.Add(new LayerData { Type = TypeDepth, R = depthColors[d][0], G = depthColors[d][1], B = depthColors[d][2], Polygons = polys });
            }

            // Land boundary
            var landPolys = TraceField(heights, W, H, WaterThreshold, 0.1f);
            Console.WriteLine($"[BiomeExtractor] land polygons: {landPolys.Count}");
            if (landPolys.Count > 0)
                layers.Add(new LayerData { Type = TypeLand, R = 0x3b, G = 0x5a, B = 0x3b, Polygons = landPolys });

            // Elevation bands
            float[] bandThresholds = { 50f, 100f, 170f, 280f };
            byte[][] bandColors = { new byte[]{0x4a,0x6a,0x44}, new byte[]{0x5a,0x7a,0x54}, new byte[]{0x6a,0x8a,0x64}, new byte[]{0x7a,0x9a,0x74} };
            for (int b = 0; b < bandThresholds.Length; b++)
            {
                var polys = TraceField(heights, W, H, bandThresholds[b], 0.1f);
                Console.WriteLine($"[BiomeExtractor] elevation {bandThresholds[b]:F0}m: {polys.Count} polygons");
                if (polys.Count > 0)
                    layers.Add(new LayerData { Type = TypeElevation, R = bandColors[b][0], G = bandColors[b][1], B = bandColors[b][2], Polygons = polys });
            }
        }

        // ── Biome polygons ────────────────────────────────────────────
        var keys = new int[W * H];
        var avgColors = new Dictionary<int, (long rSum, long gSum, long bSum, int count)>();

        for (int i = 0; i < W * H; i++)
        {
            if (heights != null && heights[i] < WaterThreshold)
            {
                keys[i] = -1;
                continue;
            }

            byte r = grid[i * 3], g = grid[i * 3 + 1], b = grid[i * 3 + 2];
            int qr = r >> QuantShift, qg = g >> QuantShift, qb = b >> QuantShift;
            int key = (qr << 8) | (qg << 4) | qb;
            keys[i] = key;

            if (!avgColors.ContainsKey(key))
                avgColors[key] = (0, 0, 0, 0);
            var c = avgColors[key];
            avgColors[key] = (c.rSum + r, c.gSum + g, c.bSum + b, c.count + 1);
        }

        foreach (var (key, colorInfo) in avgColors)
        {
            if (colorInfo.count < MinComponentPixels) continue;

            byte avgR = (byte)(colorInfo.rSum / colorInfo.count);
            byte avgG = (byte)(colorInfo.gSum / colorInfo.count);
            byte avgB = (byte)(colorInfo.bSum / colorInfo.count);

            // Force swamp biome to dark brown
            bool isSwamp = avgR > avgG + 15 && avgG > avgB + 10 && avgG > 70 && avgR < 210;
            if (isSwamp)
            {
                avgR = 0x47; avgG = 0x34; avgB = 0x2F;
            }

            var mask = new float[W * H];
            for (int i = 0; i < W * H; i++)
                mask[i] = keys[i] == key ? 1f : 0f;

            var polygons = TraceField(mask, W, H, 0.5f, SimplifyEps);
            if (polygons.Count == 0) continue;

            layers.Add(new LayerData { Type = TypeBiome, R = avgR, G = avgG, B = avgB, Polygons = polygons });
        }

        // ── Forest / Mist / Lava overlays ─────────────────────────────
        if (maskPx != null && maskW > 0 && maskH > 0 && heights != null)
        {
            int mW = Math.Min(W, maskW);
            int mH = Math.Min(H, maskH);

            // Build eroded land mask: pixel must be land AND all 4 neighbours must be land.
            // This prevents marching squares from interpolating overlay edges into water.
            var landOk = new bool[mW * mH];
            for (int y = 1; y < mH - 1; y++)
                for (int x = 1; x < mW - 1; x++)
                {
                    if (heights[y * W + x] < WaterThreshold) continue;
                    if (heights[(y - 1) * W + x] < WaterThreshold) continue;
                    if (heights[(y + 1) * W + x] < WaterThreshold) continue;
                    if (heights[y * W + (x - 1)] < WaterThreshold) continue;
                    if (heights[y * W + (x + 1)] < WaterThreshold) continue;
                    landOk[y * mW + x] = true;
                }

            var forestField = new float[mW * mH];
            var mistField = new float[mW * mH];
            var lavaField = new float[mW * mH];

            for (int y = 0; y < mH; y++)
                for (int x = 0; x < mW; x++)
                {
                    int i = y * mW + x;
                    if (!landOk[i]) continue;
                    int mi = (y * maskW + x) * 4;
                    forestField[i] = maskPx[mi] / 255f;
                    mistField[i] = maskPx[mi + 1] / 255f;
                    lavaField[i] = maskPx[mi + 2] / 255f;
                }

            var forestPolys = TraceField(forestField, mW, mH, 0.15f, 0.2f);
            if (forestPolys.Count > 0)
                layers.Add(new LayerData { Type = TypeForest, R = 0x28, G = 0x37, B = 0x1e, Polygons = forestPolys });
            Console.WriteLine($"[BiomeExtractor] forest overlay: {forestPolys.Count} polygons");

            var mistPolys = TraceField(mistField, mW, mH, 0.1f, 0.2f);
            if (mistPolys.Count > 0)
                layers.Add(new LayerData { Type = TypeMist, R = 0x69, G = 0x58, B = 0x87, Polygons = mistPolys });
            Console.WriteLine($"[BiomeExtractor] mist overlay: {mistPolys.Count} polygons");

            var lavaPolys = TraceField(lavaField, mW, mH, 0.1f, 0.2f);
            if (lavaPolys.Count > 0)
                layers.Add(new LayerData { Type = TypeLava, R = 0xf1, G = 0x6b, B = 0x06, Polygons = lavaPolys });
            Console.WriteLine($"[BiomeExtractor] lava overlay: {lavaPolys.Count} polygons");
        }

        // ── Contour lines ─────────────────────────────────────────────
        var contours = new List<ContourData>();
        if (heights != null)
        {
            for (float h = 30f; h <= 500f; h += 10f)
            {
                bool major = ((int)h % 50) == 0;
                var lines = TraceField(heights, W, H, h, 0.1f);
                if (lines.Count > 0)
                    contours.Add(new ContourData { Height = h, Major = major, Lines = lines });
            }
            Console.WriteLine($"[BiomeExtractor] contour levels: {contours.Count}");
        }

        return (W, layers, contours);
    }

    // ── V2: Targeted reduction (default) ─────────────────────────────
    //
    // Wraps the V1 Extract output and removes vertices in a targeted way:
    //   • Shallow-water depth bands get aggressive simplification — they
    //     are large, smooth, and visually low-stakes.
    //   • Everything in the "deep north" (top NorthRegionFraction of the
    //     map) gets a much higher simplification epsilon. Almost no players
    //     venture there today, so coarser geometry is fine.
    //   • Land / biome / overlay / contour layers receive only a light
    //     baseline cleanup outside the north region.
    //
    // V1 Extract is left untouched and reachable via the *Legacy entry
    // points below.

    const float NorthRegionFraction = 0.15f; // top 15% of map = "deep north"

    static (int gridSize, List<LayerData> layers, List<ContourData> contours) ExtractV2(
        byte[] mapPx, int srcW, int srcH,
        byte[]? heightPx, int heightW, int heightH,
        byte[]? maskPx, int maskW, int maskH)
    {
        var (gridSize, layers, contours) = Extract(mapPx, srcW, srcH, heightPx, heightW, heightH, maskPx, maskW, maskH);
        ApplyTargetedReduction(gridSize, layers, contours);
        return (gridSize, layers, contours);
    }

    static void ApplyTargetedReduction(int gridSize, List<LayerData> layers, List<ContourData> contours)
    {
        float northY = gridSize * NorthRegionFraction;

        long totalBefore = 0, totalAfter = 0;
        long shallowBefore = 0, shallowAfter = 0;
        long northBefore = 0, northAfter = 0;
        long contourBefore = 0, contourAfter = 0;
        int polygonCount = 0, contourLineCount = 0;

        foreach (var layer in layers)
        {
            // Per-type epsilon settings (base, northern).
            // V1 used 0.1f for depth/elevation/contours and 0.4f for biomes.
            float baseEps, northEps;
            switch (layer.Type)
            {
                case TypeDepth:     baseEps = 2.0f; northEps = 4.0f; break; // shallow water — primary target
                case TypeLand:      baseEps = 0.4f; northEps = 1.5f; break;
                case TypeElevation: baseEps = 0.4f; northEps = 1.5f; break;
                case TypeBiome:     baseEps = 0.5f; northEps = 1.5f; break;
                case TypeForest:
                case TypeMist:
                case TypeLava:      baseEps = 0.3f; northEps = 1.0f; break;
                default:            baseEps = 0.3f; northEps = 1.0f; break;
            }

            for (int p = 0; p < layer.Polygons.Count; p++)
            {
                var pts = layer.Polygons[p];
                int vertsBefore = pts.Length / 2;
                int northBeforeLocal = CountNorthVerts(pts, northY);

                var reduced = SimplifyRegional(pts, baseEps, northEps, northY);
                int vertsAfter = reduced.Length / 2;
                int northAfterLocal = CountNorthVerts(reduced, northY);

                totalBefore += vertsBefore;
                totalAfter += vertsAfter;
                northBefore += northBeforeLocal;
                northAfter += northAfterLocal;
                if (layer.Type == TypeDepth)
                {
                    shallowBefore += vertsBefore;
                    shallowAfter += vertsAfter;
                }

                layer.Polygons[p] = reduced;
                polygonCount++;
            }
        }

        foreach (var c in contours)
        {
            for (int p = 0; p < c.Lines.Count; p++)
            {
                var pts = c.Lines[p];
                int vertsBefore = pts.Length / 2;
                int northBeforeLocal = CountNorthVerts(pts, northY);

                var reduced = SimplifyRegional(pts, 0.25f, 1.5f, northY);
                int vertsAfter = reduced.Length / 2;
                int northAfterLocal = CountNorthVerts(reduced, northY);

                totalBefore += vertsBefore;
                totalAfter += vertsAfter;
                northBefore += northBeforeLocal;
                northAfter += northAfterLocal;
                contourBefore += vertsBefore;
                contourAfter += vertsAfter;

                c.Lines[p] = reduced;
                contourLineCount++;
            }
        }

        static double Pct(long before, long after)
            => before == 0 ? 0 : 100.0 * (before - after) / before;

        Console.WriteLine($"[BiomeExtractor v2] targeted reduction report (gridSize={gridSize}, northY<{northY:F0}):");
        Console.WriteLine($"  shallow water:  {shallowBefore,8} → {shallowAfter,8} verts  ({Pct(shallowBefore, shallowAfter):F1}% reduction)");
        Console.WriteLine($"  north region:   {northBefore,8} → {northAfter,8} verts  ({Pct(northBefore, northAfter):F1}% reduction)");
        Console.WriteLine($"  contours:       {contourBefore,8} → {contourAfter,8} verts  ({Pct(contourBefore, contourAfter):F1}% reduction)");
        Console.WriteLine($"  TOTAL:          {totalBefore,8} → {totalAfter,8} verts  ({Pct(totalBefore, totalAfter):F1}% reduction)");
        Console.WriteLine($"  layers={layers.Count}, polygons={polygonCount}, contour lines={contourLineCount}");
    }

    static int CountNorthVerts(float[] pts, float northY)
    {
        int n = 0;
        for (int i = 1; i < pts.Length; i += 2)
            if (pts[i] < northY) n++;
        return n;
    }

    static float[] SimplifyRegional(float[] pts, float baseEps, float northEps, float northY)
    {
        int n = pts.Length / 2;
        if (n <= 2) return pts;
        var list = new List<(float X, float Y)>(n);
        for (int i = 0; i < n; i++) list.Add((pts[i * 2], pts[i * 2 + 1]));
        var simplified = DouglasPeuckerRegional(list, baseEps, northEps, northY);
        if (simplified.Count == n) return pts;
        var result = new float[simplified.Count * 2];
        for (int i = 0; i < simplified.Count; i++)
        {
            result[i * 2] = simplified[i].X;
            result[i * 2 + 1] = simplified[i].Y;
        }
        return result;
    }

    // Position-aware Douglas-Peucker. Uses northEps when the segment under
    // consideration is centered in the northern band, baseEps otherwise.
    static List<(float X, float Y)> DouglasPeuckerRegional(
        List<(float X, float Y)> pts, float baseEps, float northEps, float northY)
    {
        if (pts.Count <= 2) return pts;
        float maxD = 0; int maxI = 0;
        var (ax, ay) = pts[0]; var (bx, by) = pts[^1];
        for (int i = 1; i < pts.Count - 1; i++)
        {
            float d = PerpDist(pts[i].X, pts[i].Y, ax, ay, bx, by);
            if (d > maxD) { maxD = d; maxI = i; }
        }
        float midY = (ay + by) * 0.5f;
        float eps = midY < northY ? northEps : baseEps;
        if (maxD > eps)
        {
            var left = DouglasPeuckerRegional(pts.GetRange(0, maxI + 1), baseEps, northEps, northY);
            var right = DouglasPeuckerRegional(pts.GetRange(maxI, pts.Count - maxI), baseEps, northEps, northY);
            var result = new List<(float X, float Y)>(left.Count + right.Count);
            result.AddRange(left);
            result.AddRange(right.GetRange(1, right.Count - 1));
            return result;
        }
        return new List<(float X, float Y)> { pts[0], pts[^1] };
    }

    // ── Binary serialization ─────────────────────────────────────────
    //
    // Format: "BVEC" v2, u16 fixed-point coords (1/32 pixel precision)
    //
    // Header:
    //   [4] magic "BVEC"
    //   [1] version = 2
    //   [2] gridSize (u16)
    //   [2] numLayers (u16)
    //
    // Per layer:
    //   [1] type (u8)
    //   [3] RGB color (u8×3)
    //   [2] numPolygons (u16)
    //   Per polygon:
    //     [2] numVerts (u16)
    //     [numVerts×4] x,y as u16 pairs (fixed-point: value = coord × 32)
    //
    // After layers:
    //   [2] numContourLevels (u16)
    //   Per contour:
    //     [4] height (f32)
    //     [1] flags (u8, bit0=major)
    //     [2] numPolylines (u16)
    //     Per polyline:
    //       [2] numVerts (u16)
    //       [numVerts×4] x,y as u16 pairs

    const float CoordScale = 32f; // u16 fixed-point: 1/32 pixel precision

    public static byte[] ExtractBinary(byte[] mapPx, int srcW, int srcH,
        byte[]? heightPx = null, int heightW = 0, int heightH = 0,
        byte[]? maskPx = null, int maskW = 0, int maskH = 0,
        bool legacy = false)
    {
        var (gridSize, layers, contours) = legacy
            ? Extract(mapPx, srcW, srcH, heightPx, heightW, heightH, maskPx, maskW, maskH)
            : ExtractV2(mapPx, srcW, srcH, heightPx, heightW, heightH, maskPx, maskW, maskH);

        using var ms = new MemoryStream();
        using var w = new BinaryWriter(ms);

        // Header
        w.Write((byte)'B'); w.Write((byte)'V'); w.Write((byte)'E'); w.Write((byte)'C');
        w.Write((byte)2); // version
        w.Write((ushort)gridSize);
        w.Write((ushort)layers.Count);

        // Layers
        foreach (var layer in layers)
        {
            w.Write(layer.Type);
            w.Write(layer.R);
            w.Write(layer.G);
            w.Write(layer.B);
            w.Write((ushort)layer.Polygons.Count);

            foreach (var pts in layer.Polygons)
            {
                int numVerts = pts.Length / 2;
                w.Write((ushort)numVerts);
                for (int i = 0; i < pts.Length; i++)
                    w.Write((ushort)Math.Clamp(pts[i] * CoordScale + 0.5f, 0, 65535));
            }
        }

        // Contours
        w.Write((ushort)contours.Count);
        foreach (var c in contours)
        {
            w.Write(c.Height);
            w.Write((byte)(c.Major ? 1 : 0));
            w.Write((ushort)c.Lines.Count);

            foreach (var pts in c.Lines)
            {
                int numVerts = pts.Length / 2;
                w.Write((ushort)numVerts);
                for (int i = 0; i < pts.Length; i++)
                    w.Write((ushort)Math.Clamp(pts[i] * CoordScale + 0.5f, 0, 65535));
            }
        }

        w.Flush();
        return ms.ToArray();
    }

    /// <summary>Load from cache file paths, extract binary.</summary>
    public static byte[] ExtractBinaryFromFile(string mapTexCachePath, string? heightTexCachePath = null,
        string? maskTexCachePath = null)
    {
        using var img = Image.Load<Rgb24>(mapTexCachePath);
        var px = new byte[img.Width * img.Height * 3];
        img.CopyPixelDataTo(px);

        byte[]? hPx = null; int hW = 0, hH = 0;
        if (heightTexCachePath != null && File.Exists(heightTexCachePath))
        {
            using var hImg = Image.Load<Rgba32>(heightTexCachePath);
            hW = hImg.Width; hH = hImg.Height;
            hPx = new byte[hW * hH * 4];
            hImg.CopyPixelDataTo(hPx);
        }

        byte[]? mPx = null; int mW = 0, mH = 0;
        if (maskTexCachePath != null && File.Exists(maskTexCachePath))
        {
            using var mImg = Image.Load<Rgba32>(maskTexCachePath);
            mW = mImg.Width; mH = mImg.Height;
            mPx = new byte[mW * mH * 4];
            mImg.CopyPixelDataTo(mPx);
        }

        return ExtractBinary(px, img.Width, img.Height, hPx, hW, hH, mPx, mW, mH);
    }

    /// <summary>Load from in-memory PNG byte arrays (e.g. from database blobs).</summary>
    public static byte[] ExtractBinaryFromMemory(byte[] mapPng, byte[] heightPng, byte[] maskPng)
    {
        using var img = Image.Load<Rgb24>(mapPng);
        var px = new byte[img.Width * img.Height * 3];
        img.CopyPixelDataTo(px);

        byte[]? hPx = null; int hW = 0, hH = 0;
        if (heightPng.Length > 0)
        {
            using var hImg = Image.Load<Rgba32>(heightPng);
            hW = hImg.Width; hH = hImg.Height;
            hPx = new byte[hW * hH * 4];
            hImg.CopyPixelDataTo(hPx);
        }

        byte[]? mPx = null; int mW = 0, mH = 0;
        if (maskPng.Length > 0)
        {
            using var mImg = Image.Load<Rgba32>(maskPng);
            mW = mImg.Width; mH = mImg.Height;
            mPx = new byte[mW * mH * 4];
            mImg.CopyPixelDataTo(mPx);
        }

        return ExtractBinary(px, img.Width, img.Height, hPx, hW, hH, mPx, mW, mH);
    }

    // ── JSON serialization (kept for backwards compatibility) ────────

    public static string ExtractJson(byte[] mapPx, int srcW, int srcH,
        byte[]? heightPx = null, int heightW = 0, int heightH = 0,
        byte[]? maskPx = null, int maskW = 0, int maskH = 0,
        bool legacy = false)
    {
        var (gridSize, layers, contours) = legacy
            ? Extract(mapPx, srcW, srcH, heightPx, heightW, heightH, maskPx, maskW, maskH)
            : ExtractV2(mapPx, srcW, srcH, heightPx, heightW, heightH, maskPx, maskW, maskH);

        string[] typeNames = { "depth", "land", "elevation", "biome", "forest", "mist", "lava" };
        var jsonLayers = new List<object>();
        foreach (var layer in layers)
        {
            string typeName = layer.Type < typeNames.Length ? typeNames[layer.Type] : $"type{layer.Type}";
            string color = $"#{layer.R:x2}{layer.G:x2}{layer.B:x2}";
            jsonLayers.Add(new { type = typeName, color, polygons = layer.Polygons });
        }

        var jsonContours = new List<object>();
        foreach (var c in contours)
        {
            jsonContours.Add(new { height = c.Height, major = c.Major, lines = c.Lines });
        }

        return JsonSerializer.Serialize(new { gridSize, layers = jsonLayers, contours = jsonContours });
    }

    public static string ExtractFromFile(string mapTexCachePath, string? heightTexCachePath = null,
        string? maskTexCachePath = null)
    {
        using var img = Image.Load<Rgb24>(mapTexCachePath);
        var px = new byte[img.Width * img.Height * 3];
        img.CopyPixelDataTo(px);

        byte[]? hPx = null; int hW = 0, hH = 0;
        if (heightTexCachePath != null && File.Exists(heightTexCachePath))
        {
            using var hImg = Image.Load<Rgba32>(heightTexCachePath);
            hW = hImg.Width; hH = hImg.Height;
            hPx = new byte[hW * hH * 4];
            hImg.CopyPixelDataTo(hPx);
        }

        byte[]? mPx = null; int mW = 0, mH = 0;
        if (maskTexCachePath != null && File.Exists(maskTexCachePath))
        {
            using var mImg = Image.Load<Rgba32>(maskTexCachePath);
            mW = mImg.Width; mH = mImg.Height;
            mPx = new byte[mW * mH * 4];
            mImg.CopyPixelDataTo(mPx);
        }

        return ExtractJson(px, img.Width, img.Height, hPx, hW, hH, mPx, mW, mH);
    }

    // ── Marching Squares ────────────────────────────────────────────────

    /// <summary>Trace a scalar field at a threshold → simplified polygon arrays.</summary>
    static List<float[]> TraceField(float[] field, int W, int H, float threshold, float simplifyEps)
    {
        var segments = MarchingSquares(field, W, H, threshold);
        if (segments.Count == 0) return new();

        var chains = ChainSegments(segments);
        var polygons = new List<float[]>();

        foreach (var chain in chains)
        {
            if (chain.Count < 4) continue;
            var simplified = DouglasPeucker(chain, simplifyEps);
            if (simplified.Count < 3) continue;

            var pts = new float[simplified.Count * 2];
            for (int i = 0; i < simplified.Count; i++)
            {
                pts[i * 2] = simplified[i].X;
                pts[i * 2 + 1] = simplified[i].Y;
            }
            polygons.Add(pts);
        }

        return polygons;
    }

    struct Seg { public float X1, Y1, X2, Y2; }

    static List<Seg> MarchingSquares(float[] field, int W, int H, float threshold)
    {
        var segs = new List<Seg>();
        for (int y = 0; y < H - 1; y++)
        for (int x = 0; x < W - 1; x++)
        {
            float v00 = field[y * W + x];
            float v10 = field[y * W + x + 1];
            float v01 = field[(y + 1) * W + x];
            float v11 = field[(y + 1) * W + x + 1];

            int code = 0;
            if (v00 >= threshold) code |= 1;
            if (v10 >= threshold) code |= 2;
            if (v11 >= threshold) code |= 4;
            if (v01 >= threshold) code |= 8;

            if (code == 0 || code == 15) continue;

            float Lerp(float a, float b) => a == b ? 0.5f : (threshold - a) / (b - a);

            float topX = x + Lerp(v00, v10);
            float botX = x + Lerp(v01, v11);
            float leftY = y + Lerp(v00, v01);
            float rightY = y + Lerp(v10, v11);

            switch (code)
            {
                case 1: case 14: segs.Add(new Seg { X1 = topX, Y1 = y, X2 = x, Y2 = leftY }); break;
                case 2: case 13: segs.Add(new Seg { X1 = x + 1, Y1 = rightY, X2 = topX, Y2 = y }); break;
                case 3: case 12: segs.Add(new Seg { X1 = x + 1, Y1 = rightY, X2 = x, Y2 = leftY }); break;
                case 4: case 11: segs.Add(new Seg { X1 = botX, Y1 = y + 1, X2 = x + 1, Y2 = rightY }); break;
                case 5:
                {
                    float c = (v00 + v10 + v01 + v11) * 0.25f;
                    if (c >= threshold)
                    { segs.Add(new Seg { X1 = topX, Y1 = y, X2 = x + 1, Y2 = rightY });
                      segs.Add(new Seg { X1 = x, Y1 = leftY, X2 = botX, Y2 = y + 1 }); }
                    else
                    { segs.Add(new Seg { X1 = topX, Y1 = y, X2 = x, Y2 = leftY });
                      segs.Add(new Seg { X1 = x + 1, Y1 = rightY, X2 = botX, Y2 = y + 1 }); }
                    break;
                }
                case 6: case 9: segs.Add(new Seg { X1 = botX, Y1 = y + 1, X2 = topX, Y2 = y }); break;
                case 7: case 8: segs.Add(new Seg { X1 = x, Y1 = leftY, X2 = botX, Y2 = y + 1 }); break;
                case 10:
                {
                    float c = (v00 + v10 + v01 + v11) * 0.25f;
                    if (c >= threshold)
                    { segs.Add(new Seg { X1 = x, Y1 = leftY, X2 = topX, Y2 = y });
                      segs.Add(new Seg { X1 = x + 1, Y1 = rightY, X2 = botX, Y2 = y + 1 }); }
                    else
                    { segs.Add(new Seg { X1 = x + 1, Y1 = rightY, X2 = topX, Y2 = y });
                      segs.Add(new Seg { X1 = x, Y1 = leftY, X2 = botX, Y2 = y + 1 }); }
                    break;
                }
            }
        }
        return segs;
    }

    // ── Chain segments into closed polylines ─────────────────────────────

    static List<List<(float X, float Y)>> ChainSegments(List<Seg> segments)
    {
        const float snap = 0.001f;
        long Key(float x, float y) => ((long)(int)(x / snap)) << 32 | (uint)(int)(y / snap);

        var adj = new Dictionary<long, List<(int idx, bool isEnd)>>();
        void Add(long k, int idx, bool isEnd)
        {
            if (!adj.TryGetValue(k, out var list)) { list = new(2); adj[k] = list; }
            list.Add((idx, isEnd));
        }
        for (int i = 0; i < segments.Count; i++)
        {
            var s = segments[i];
            Add(Key(s.X1, s.Y1), i, false);
            Add(Key(s.X2, s.Y2), i, true);
        }

        var used = new bool[segments.Count];
        var chains = new List<List<(float X, float Y)>>();

        for (int i = 0; i < segments.Count; i++)
        {
            if (used[i]) continue;
            used[i] = true;
            var s = segments[i];
            var chain = new List<(float X, float Y)> { (s.X1, s.Y1), (s.X2, s.Y2) };

            Extend(chain, false);
            Extend(chain, true);
            chains.Add(chain);
        }

        void Extend(List<(float X, float Y)> chain, bool fromStart)
        {
            for (int iter = 0; iter < segments.Count; iter++)
            {
                var (ex, ey) = fromStart ? chain[0] : chain[^1];
                long key = Key(ex, ey);
                if (!adj.TryGetValue(key, out var nbrs)) break;
                bool found = false;
                foreach (var (idx, isEnd) in nbrs)
                {
                    if (used[idx]) continue;
                    used[idx] = true;
                    var ns = segments[idx];
                    float nx = isEnd ? ns.X1 : ns.X2;
                    float ny = isEnd ? ns.Y1 : ns.Y2;
                    if (fromStart) chain.Insert(0, (nx, ny));
                    else chain.Add((nx, ny));
                    found = true;
                    break;
                }
                if (!found) break;
            }
        }

        return chains;
    }

    // ── Douglas-Peucker simplification ──────────────────────────────────

    static List<(float X, float Y)> DouglasPeucker(List<(float X, float Y)> pts, float eps)
    {
        if (pts.Count <= 2) return pts;
        float maxD = 0; int maxI = 0;
        var (ax, ay) = pts[0]; var (bx, by) = pts[^1];
        for (int i = 1; i < pts.Count - 1; i++)
        {
            float d = PerpDist(pts[i].X, pts[i].Y, ax, ay, bx, by);
            if (d > maxD) { maxD = d; maxI = i; }
        }
        if (maxD > eps)
        {
            var left = DouglasPeucker(pts.GetRange(0, maxI + 1), eps);
            var right = DouglasPeucker(pts.GetRange(maxI, pts.Count - maxI), eps);
            var result = new List<(float X, float Y)>(left.Count + right.Count);
            result.AddRange(left);
            result.AddRange(right.GetRange(1, right.Count - 1));
            return result;
        }
        return new List<(float X, float Y)> { pts[0], pts[^1] };
    }

    static float PerpDist(float px, float py, float ax, float ay, float bx, float by)
    {
        float dx = bx - ax, dy = by - ay;
        float lenSq = dx * dx + dy * dy;
        if (lenSq < 1e-10f) return MathF.Sqrt((px - ax) * (px - ax) + (py - ay) * (py - ay));
        float t = Math.Clamp(((px - ax) * dx + (py - ay) * dy) / lenSq, 0f, 1f);
        float cx = ax + t * dx, cy = ay + t * dy;
        return MathF.Sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
    }
}
