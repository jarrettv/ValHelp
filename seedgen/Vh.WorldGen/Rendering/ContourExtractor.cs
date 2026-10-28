using System;
using System.Collections.Generic;
using System.IO;

namespace ValHelpApi.ModuleTrack.Rendering;

/// <summary>
/// Extracts contour lines from a height field using marching squares.
/// Outputs compact binary: [magic "CNTL"][version u8][numPolylines u32]
/// Per polyline: [height f32][flags u8: bit0=major][numVerts u32][x,y f32 pairs]
/// </summary>
public static class ContourExtractor
{
    const float WaterThreshold = 29.5f;
    const int MinorInterval = 10;
    const int MajorInterval = 50;
    const float SimplifyEpsilon = 0.5f;

    static readonly byte[] Magic = "CNTL"u8.ToArray();
    const byte Version = 1;

    /// <summary>Extract contour polylines from height data.</summary>
    /// <param name="heights">Row-major float array [H * W]</param>
    /// <param name="W">Width of height field</param>
    /// <param name="H">Height of height field</param>
    /// <returns>Binary contour data</returns>
    public static byte[] Extract(float[] heights, int W, int H)
    {
        var polylines = new List<Polyline>();

        // Generate contours from 30m to 500m every 10m
        for (float threshold = 30f; threshold <= 500f; threshold += MinorInterval)
        {
            bool isMajor = ((int)threshold % MajorInterval) == 0;
            var segments = MarchingSquares(heights, W, H, threshold);
            var chains = ChainSegments(segments);

            foreach (var chain in chains)
            {
                var simplified = DouglasPeucker(chain, SimplifyEpsilon);
                if (simplified.Count >= 2)
                    polylines.Add(new Polyline(threshold, isMajor, simplified));
            }
        }

        return Serialize(polylines);
    }

    /// <summary>Extract contours from raw height texture bytes (RGBA32).</summary>
    public static byte[] ExtractFromTexture(byte[] heightPx, int W, int H)
    {
        var heights = new float[W * H];
        for (int y = 0; y < H; y++)
            for (int x = 0; x < W; x++)
            {
                int idx = (y * W + x) * 4;
                heights[y * W + x] = (heightPx[idx] * 256 + heightPx[idx + 1]) / 127.5f;
            }
        return Extract(heights, W, H);
    }

    struct Segment
    {
        public float X1, Y1, X2, Y2;
    }

    record Polyline(float Height, bool Major, List<(float X, float Y)> Vertices);

    static List<Segment> MarchingSquares(float[] heights, int W, int H, float threshold)
    {
        var segments = new List<Segment>();

        for (int y = 0; y < H - 1; y++)
        {
            for (int x = 0; x < W - 1; x++)
            {
                float v00 = heights[y * W + x];
                float v10 = heights[y * W + x + 1];
                float v01 = heights[(y + 1) * W + x];
                float v11 = heights[(y + 1) * W + x + 1];

                // Skip cells entirely below water
                if (v00 < WaterThreshold && v10 < WaterThreshold &&
                    v01 < WaterThreshold && v11 < WaterThreshold)
                    continue;

                int code = 0;
                if (v00 >= threshold) code |= 1;
                if (v10 >= threshold) code |= 2;
                if (v11 >= threshold) code |= 4;
                if (v01 >= threshold) code |= 8;

                if (code == 0 || code == 15) continue;

                // Interpolation helpers
                float LerpX(float a, float b) => a == b ? 0.5f : (threshold - a) / (b - a);

                float topX = x + LerpX(v00, v10);
                float botX = x + LerpX(v01, v11);
                float leftY = y + LerpX(v00, v01);
                float rightY = y + LerpX(v10, v11);

                // Top edge: (topX, y), Bottom edge: (botX, y+1)
                // Left edge: (x, leftY), Right edge: (x+1, rightY)

                switch (code)
                {
                    case 1: case 14:
                        segments.Add(new Segment { X1 = topX, Y1 = y, X2 = x, Y2 = leftY });
                        break;
                    case 2: case 13:
                        segments.Add(new Segment { X1 = x + 1, Y1 = rightY, X2 = topX, Y2 = y });
                        break;
                    case 3: case 12:
                        segments.Add(new Segment { X1 = x + 1, Y1 = rightY, X2 = x, Y2 = leftY });
                        break;
                    case 4: case 11:
                        segments.Add(new Segment { X1 = botX, Y1 = y + 1, X2 = x + 1, Y2 = rightY });
                        break;
                    case 5:
                        // Saddle: use center value to disambiguate
                        float center = (v00 + v10 + v01 + v11) * 0.25f;
                        if (center >= threshold)
                        {
                            segments.Add(new Segment { X1 = topX, Y1 = y, X2 = x + 1, Y2 = rightY });
                            segments.Add(new Segment { X1 = x, Y1 = leftY, X2 = botX, Y2 = y + 1 });
                        }
                        else
                        {
                            segments.Add(new Segment { X1 = topX, Y1 = y, X2 = x, Y2 = leftY });
                            segments.Add(new Segment { X1 = x + 1, Y1 = rightY, X2 = botX, Y2 = y + 1 });
                        }
                        break;
                    case 6: case 9:
                        segments.Add(new Segment { X1 = botX, Y1 = y + 1, X2 = topX, Y2 = y });
                        break;
                    case 7: case 8:
                        segments.Add(new Segment { X1 = x, Y1 = leftY, X2 = botX, Y2 = y + 1 });
                        break;
                    case 10:
                        float c2 = (v00 + v10 + v01 + v11) * 0.25f;
                        if (c2 >= threshold)
                        {
                            segments.Add(new Segment { X1 = x, Y1 = leftY, X2 = topX, Y2 = y });
                            segments.Add(new Segment { X1 = x + 1, Y1 = rightY, X2 = botX, Y2 = y + 1 });
                        }
                        else
                        {
                            segments.Add(new Segment { X1 = x + 1, Y1 = rightY, X2 = topX, Y2 = y });
                            segments.Add(new Segment { X1 = x, Y1 = leftY, X2 = botX, Y2 = y + 1 });
                        }
                        break;
                }
            }
        }

        return segments;
    }

    /// <summary>Chain segments into polylines by matching endpoints.</summary>
    static List<List<(float X, float Y)>> ChainSegments(List<Segment> segments)
    {
        if (segments.Count == 0) return new();

        // Spatial hash for endpoint matching
        const float Snap = 0.001f;
        long Key(float x, float y) => ((long)(int)(x / Snap)) << 32 | (uint)(int)(y / Snap);

        // Build adjacency: each endpoint → list of (segIndex, isEnd2)
        var endpointMap = new Dictionary<long, List<(int seg, bool isEnd2)>>();

        void AddEnd(long key, int seg, bool isEnd2)
        {
            if (!endpointMap.TryGetValue(key, out var list))
            {
                list = new List<(int, bool)>(2);
                endpointMap[key] = list;
            }
            list.Add((seg, isEnd2));
        }

        for (int i = 0; i < segments.Count; i++)
        {
            var s = segments[i];
            AddEnd(Key(s.X1, s.Y1), i, false);
            AddEnd(Key(s.X2, s.Y2), i, true);
        }

        var used = new bool[segments.Count];
        var chains = new List<List<(float X, float Y)>>();

        for (int i = 0; i < segments.Count; i++)
        {
            if (used[i]) continue;
            used[i] = true;

            var chain = new List<(float X, float Y)>();
            var s = segments[i];
            chain.Add((s.X1, s.Y1));
            chain.Add((s.X2, s.Y2));

            // Extend forward from end
            ExtendChain(chain, false, segments, used, endpointMap, Key);
            // Extend backward from start
            ExtendChain(chain, true, segments, used, endpointMap, Key);

            chains.Add(chain);
        }

        return chains;
    }

    static void ExtendChain(
        List<(float X, float Y)> chain, bool fromStart,
        List<Segment> segments, bool[] used,
        Dictionary<long, List<(int seg, bool isEnd2)>> endpointMap,
        Func<float, float, long> Key)
    {
        while (true)
        {
            var (ex, ey) = fromStart ? chain[0] : chain[^1];
            long key = Key(ex, ey);

            if (!endpointMap.TryGetValue(key, out var neighbors)) break;

            bool extended = false;
            for (int n = 0; n < neighbors.Count; n++)
            {
                var (segIdx, isEnd2) = neighbors[n];
                if (used[segIdx]) continue;

                used[segIdx] = true;
                var ns = segments[segIdx];

                // Get the other endpoint
                float nx, ny;
                if (isEnd2) { nx = ns.X1; ny = ns.Y1; }
                else { nx = ns.X2; ny = ns.Y2; }

                if (fromStart) chain.Insert(0, (nx, ny));
                else chain.Add((nx, ny));

                extended = true;
                break;
            }

            if (!extended) break;
        }
    }

    /// <summary>Douglas-Peucker polyline simplification.</summary>
    static List<(float X, float Y)> DouglasPeucker(List<(float X, float Y)> points, float epsilon)
    {
        if (points.Count <= 2) return points;

        float maxDist = 0;
        int maxIdx = 0;
        var (ax, ay) = points[0];
        var (bx, by) = points[^1];

        for (int i = 1; i < points.Count - 1; i++)
        {
            float d = PerpendicularDist(points[i].X, points[i].Y, ax, ay, bx, by);
            if (d > maxDist)
            {
                maxDist = d;
                maxIdx = i;
            }
        }

        if (maxDist > epsilon)
        {
            var left = DouglasPeucker(points.GetRange(0, maxIdx + 1), epsilon);
            var right = DouglasPeucker(points.GetRange(maxIdx, points.Count - maxIdx), epsilon);
            var result = new List<(float X, float Y)>(left.Count + right.Count - 1);
            result.AddRange(left);
            result.AddRange(right.GetRange(1, right.Count - 1));
            return result;
        }

        return new List<(float X, float Y)> { points[0], points[^1] };
    }

    static float PerpendicularDist(float px, float py, float ax, float ay, float bx, float by)
    {
        float dx = bx - ax, dy = by - ay;
        float lenSq = dx * dx + dy * dy;
        if (lenSq < 1e-10f)
            return MathF.Sqrt((px - ax) * (px - ax) + (py - ay) * (py - ay));
        float t = Math.Clamp(((px - ax) * dx + (py - ay) * dy) / lenSq, 0f, 1f);
        float cx = ax + t * dx, cy = ay + t * dy;
        return MathF.Sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
    }

    static byte[] Serialize(List<Polyline> polylines)
    {
        using var ms = new MemoryStream();
        using var bw = new BinaryWriter(ms);

        bw.Write(Magic);
        bw.Write(Version);
        bw.Write((uint)polylines.Count);

        foreach (var pl in polylines)
        {
            bw.Write(pl.Height);
            bw.Write((byte)(pl.Major ? 1 : 0));
            bw.Write((uint)pl.Vertices.Count);
            foreach (var (x, y) in pl.Vertices)
            {
                bw.Write(x);
                bw.Write(y);
            }
        }

        return ms.ToArray();
    }

    /// <summary>Deserialize for verification/debugging.</summary>
    public static (int count, int totalVerts) GetStats(byte[] data)
    {
        using var ms = new MemoryStream(data);
        using var br = new BinaryReader(ms);

        br.ReadBytes(4); // magic
        br.ReadByte();   // version
        uint count = br.ReadUInt32();
        int totalVerts = 0;
        for (uint i = 0; i < count; i++)
        {
            br.ReadSingle(); // height
            br.ReadByte();   // flags
            uint nv = br.ReadUInt32();
            totalVerts += (int)nv;
            br.ReadBytes((int)nv * 8); // x,y pairs
        }
        return ((int)count, totalVerts);
    }
}
