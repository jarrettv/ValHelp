using System;
using System.IO;
using System.IO.Compression;

namespace ValHelpApi.ModuleTrack.Rendering;

/// <summary>
/// POC: Compresses BVEC v2 binary into a delta-encoded + deflated v3 format.
///
/// Strategy — topographic vector data has high spatial locality:
///   1. Delta-encode consecutive vertex coordinates (adjacent verts are close)
///   2. Zigzag-encode signed deltas → small unsigned values
///   3. Varint-encode those values → fewer bytes for small numbers
///   4. Deflate the entire payload — delta+zigzag+varint makes this very effective
///
/// Format "BVEC" v3:
///   [4] magic "BVEC"
///   [1] version = 3
///   [4] uncompressed size (u32, for pre-allocating decode buffer)
///   [...] deflate stream of the inner payload
///
/// Inner payload (after decompression):
///   [2] gridSize (u16)
///   [2] numLayers (u16)
///   Per layer:
///     [1] typeId, [3] RGB, [2] numPolygons (same as v2)
///     Per polygon:
///       [2] numVerts (u16)
///       [varint] first x (absolute, zigzag-encoded)
///       [varint] first y (absolute, zigzag-encoded)
///       [varint...] subsequent deltas: dx, dy pairs (zigzag-encoded)
///   [2] numContourLevels
///   Per contour:
///     [4] height (f32), [1] flags, [2] numPolylines
///     Per polyline:
///       [2] numVerts
///       [varint] first x, first y (absolute, zigzag)
///       [varint...] delta dx, dy pairs (zigzag)
/// </summary>
public static class BvecCompressor
{
    /// <summary>
    /// Compress BVEC v2 bytes into v3 delta-encoded + deflate-raw format.
    /// Uses deflate-raw because browsers support DecompressionStream('deflate-raw')
    /// natively — no extra JS dependencies needed.
    /// For HTTP transport, the server can additionally apply Content-Encoding: br
    /// (brotli) transparently, stacking both compression layers.
    /// </summary>
    public static byte[] CompressV3(byte[] bvecV2)
    {
        var inner = DeltaEncode(bvecV2);

        using var output = new MemoryStream();
        using var w = new BinaryWriter(output);

        // v3 outer header
        w.Write((byte)'B'); w.Write((byte)'V'); w.Write((byte)'E'); w.Write((byte)'C');
        w.Write((byte)3);
        w.Write((uint)inner.Length);

        // Deflate-raw the inner payload (browser DecompressionStream compatible)
        using (var deflate = new DeflateStream(output, CompressionLevel.Optimal, leaveOpen: true))
        {
            deflate.Write(inner, 0, inner.Length);
        }

        w.Flush();
        return output.ToArray();
    }

    /// <summary>Decompress v3 back to v2 (for validation / benchmarking).</summary>
    public static byte[] DecompressV3ToV2(byte[] bvecV3)
    {
        using var input = new MemoryStream(bvecV3);
        using var r = new BinaryReader(input);

        // Read outer header
        var magic = new string(new[] { (char)r.ReadByte(), (char)r.ReadByte(), (char)r.ReadByte(), (char)r.ReadByte() });
        if (magic != "BVEC") throw new InvalidDataException($"Bad magic: {magic}");
        var version = r.ReadByte();
        if (version != 3) throw new InvalidDataException($"Expected v3, got v{version}");
        var uncompressedSize = r.ReadUInt32();

        // Inflate
        var inner = new byte[uncompressedSize];
        using (var deflate = new DeflateStream(input, CompressionMode.Decompress))
        {
            int totalRead = 0;
            while (totalRead < inner.Length)
            {
                int read = deflate.Read(inner, totalRead, inner.Length - totalRead);
                if (read == 0) break;
                totalRead += read;
            }
        }

        return DeltaDecode(inner);
    }



    // ── Shared: parse v2 into structured coordinate lists ─────────────

    record struct PolyData(ushort[] Coords); // flat x,y,x,y,...
    record struct LayerData(byte TypeId, byte R, byte G, byte B, List<PolyData> Polygons);
    record struct ContourData(float Height, byte Flags, List<PolyData> Lines);
    record struct ParsedV2(ushort GridSize, List<LayerData> Layers, List<ContourData> Contours);

    static ParsedV2 ParseV2(byte[] v2)
    {
        using var src = new MemoryStream(v2);
        using var rd = new BinaryReader(src);
        src.Position = 5; // skip magic + version
        var gridSize = rd.ReadUInt16();
        var numLayers = rd.ReadUInt16();

        var layers = new List<LayerData>(numLayers);
        for (int li = 0; li < numLayers; li++)
        {
            var typeId = rd.ReadByte();
            var r = rd.ReadByte(); var g = rd.ReadByte(); var b = rd.ReadByte();
            var numPolygons = rd.ReadUInt16();
            var polys = new List<PolyData>(numPolygons);
            for (int pi = 0; pi < numPolygons; pi++)
            {
                var nv = rd.ReadUInt16();
                var coords = new ushort[nv * 2];
                for (int i = 0; i < coords.Length; i++) coords[i] = rd.ReadUInt16();
                polys.Add(new PolyData(coords));
            }
            layers.Add(new LayerData(typeId, r, g, b, polys));
        }

        var numContours = rd.ReadUInt16();
        var contours = new List<ContourData>(numContours);
        for (int ci = 0; ci < numContours; ci++)
        {
            var height = rd.ReadSingle();
            var flags = rd.ReadByte();
            var numLines = rd.ReadUInt16();
            var lines = new List<PolyData>(numLines);
            for (int pli = 0; pli < numLines; pli++)
            {
                var nv = rd.ReadUInt16();
                var coords = new ushort[nv * 2];
                for (int i = 0; i < coords.Length; i++) coords[i] = rd.ReadUInt16();
                lines.Add(new PolyData(coords));
            }
            contours.Add(new ContourData(height, flags, lines));
        }

        return new ParsedV2(gridSize, layers, contours);
    }

    // ── Strategy 1: Simple delta encoding (v3) ──────────────────────────

    static byte[] DeltaEncode(byte[] v2)
    {
        var p = ParseV2(v2);
        using var dst = new MemoryStream();
        WriteU16(dst, p.GridSize);
        WriteU16(dst, (ushort)p.Layers.Count);

        foreach (var layer in p.Layers)
        {
            dst.WriteByte(layer.TypeId);
            dst.WriteByte(layer.R); dst.WriteByte(layer.G); dst.WriteByte(layer.B);
            WriteU16(dst, (ushort)layer.Polygons.Count);
            foreach (var poly in layer.Polygons)
                WriteDeltaPoly(dst, poly.Coords);
        }

        WriteU16(dst, (ushort)p.Contours.Count);
        foreach (var c in p.Contours)
        {
            var hb = BitConverter.GetBytes(c.Height);
            dst.Write(hb, 0, 4);
            dst.WriteByte(c.Flags);
            WriteU16(dst, (ushort)c.Lines.Count);
            foreach (var line in c.Lines)
                WriteDeltaPoly(dst, line.Coords);
        }
        return dst.ToArray();
    }

    static void WriteDeltaPoly(Stream dst, ushort[] coords)
    {
        int nv = coords.Length / 2;
        WriteU16(dst, (ushort)nv);
        int prevX = 0, prevY = 0;
        for (int vi = 0; vi < nv; vi++)
        {
            int x = coords[vi * 2], y = coords[vi * 2 + 1];
            WriteVarint(dst, ZigZagEncode(x - prevX));
            WriteVarint(dst, ZigZagEncode(y - prevY));
            prevX = x; prevY = y;
        }
    }

    static byte[] DeltaDecode(byte[] inner)
    {
        using var dst = new MemoryStream();
        using var w = new BinaryWriter(dst);
        int pos = 0;

        var gridSize = ReadU16(inner, ref pos);
        var numLayers = ReadU16(inner, ref pos);
        w.Write(new byte[] { (byte)'B', (byte)'V', (byte)'E', (byte)'C', 2 });
        w.Write(gridSize); w.Write(numLayers);

        for (int li = 0; li < numLayers; li++)
        {
            w.Write(inner[pos++]); w.Write(inner[pos++]); w.Write(inner[pos++]); w.Write(inner[pos++]);
            var np = ReadU16(inner, ref pos); w.Write(np);
            for (int pi = 0; pi < np; pi++) ReadDeltaPoly(inner, ref pos, w);
        }

        var nc = ReadU16(inner, ref pos); w.Write(nc);
        for (int ci = 0; ci < nc; ci++)
        {
            w.Write(inner[pos++]); w.Write(inner[pos++]); w.Write(inner[pos++]); w.Write(inner[pos++]);
            w.Write(inner[pos++]);
            var nl = ReadU16(inner, ref pos); w.Write(nl);
            for (int pli = 0; pli < nl; pli++) ReadDeltaPoly(inner, ref pos, w);
        }
        w.Flush();
        return dst.ToArray();
    }

    static void ReadDeltaPoly(byte[] buf, ref int pos, BinaryWriter w)
    {
        var nv = ReadU16(buf, ref pos); w.Write(nv);
        int prevX = 0, prevY = 0;
        for (int vi = 0; vi < nv; vi++)
        {
            prevX += ZigZagDecode(ReadVarint(buf, ref pos));
            prevY += ZigZagDecode(ReadVarint(buf, ref pos));
            w.Write((ushort)prevX); w.Write((ushort)prevY);
        }
    }

    // ── Strategy 2: Linear prediction (2nd-order delta) ─────────────────
    //
    // predict[i] = 2*prev - prev_prev  (linear extrapolation)
    // residual[i] = actual[i] - predict[i]
    // For smooth curves (contours!), residuals cluster tightly around zero.

    static byte[] PredictiveEncode(byte[] v2)
    {
        var p = ParseV2(v2);
        using var dst = new MemoryStream();
        WriteU16(dst, p.GridSize);
        WriteU16(dst, (ushort)p.Layers.Count);

        foreach (var layer in p.Layers)
        {
            dst.WriteByte(layer.TypeId);
            dst.WriteByte(layer.R); dst.WriteByte(layer.G); dst.WriteByte(layer.B);
            WriteU16(dst, (ushort)layer.Polygons.Count);
            foreach (var poly in layer.Polygons)
                WritePredictivePoly(dst, poly.Coords);
        }

        WriteU16(dst, (ushort)p.Contours.Count);
        foreach (var c in p.Contours)
        {
            var hb = BitConverter.GetBytes(c.Height);
            dst.Write(hb, 0, 4);
            dst.WriteByte(c.Flags);
            WriteU16(dst, (ushort)c.Lines.Count);
            foreach (var line in c.Lines)
                WritePredictivePoly(dst, line.Coords);
        }
        return dst.ToArray();
    }

    static void WritePredictivePoly(Stream dst, ushort[] coords)
    {
        int nv = coords.Length / 2;
        WriteU16(dst, (ushort)nv);
        int ppX = 0, ppY = 0, pX = 0, pY = 0; // prev-prev and prev
        for (int vi = 0; vi < nv; vi++)
        {
            int x = coords[vi * 2], y = coords[vi * 2 + 1];
            int predX, predY;
            if (vi < 2) { predX = pX; predY = pY; } // first two: simple delta
            else { predX = 2 * pX - ppX; predY = 2 * pY - ppY; } // linear extrapolation
            WriteVarint(dst, ZigZagEncode(x - predX));
            WriteVarint(dst, ZigZagEncode(y - predY));
            ppX = pX; ppY = pY; pX = x; pY = y;
        }
    }

    // ── Strategy 3: Stream separation (all Xs together, all Ys together) ─
    //
    // Grouping homogeneous data gives deflate longer runs of similar bytes.

    static byte[] StreamSeparatedEncode(byte[] v2)
    {
        var p = ParseV2(v2);
        // Collect all coordinate streams: metadata vs X-deltas vs Y-deltas
        using var meta = new MemoryStream();   // headers, vertex counts, layer info
        using var xStream = new MemoryStream(); // all X deltas (zigzag+varint)
        using var yStream = new MemoryStream(); // all Y deltas (zigzag+varint)

        WriteU16(meta, p.GridSize);
        WriteU16(meta, (ushort)p.Layers.Count);

        foreach (var layer in p.Layers)
        {
            meta.WriteByte(layer.TypeId);
            meta.WriteByte(layer.R); meta.WriteByte(layer.G); meta.WriteByte(layer.B);
            WriteU16(meta, (ushort)layer.Polygons.Count);
            foreach (var poly in layer.Polygons)
            {
                int nv = poly.Coords.Length / 2;
                WriteU16(meta, (ushort)nv);
                int prevX = 0, prevY = 0;
                for (int vi = 0; vi < nv; vi++)
                {
                    int x = poly.Coords[vi * 2], y = poly.Coords[vi * 2 + 1];
                    WriteVarint(xStream, ZigZagEncode(x - prevX));
                    WriteVarint(yStream, ZigZagEncode(y - prevY));
                    prevX = x; prevY = y;
                }
            }
        }

        WriteU16(meta, (ushort)p.Contours.Count);
        foreach (var c in p.Contours)
        {
            var hb = BitConverter.GetBytes(c.Height);
            meta.Write(hb, 0, 4);
            meta.WriteByte(c.Flags);
            WriteU16(meta, (ushort)c.Lines.Count);
            foreach (var line in c.Lines)
            {
                int nv = line.Coords.Length / 2;
                WriteU16(meta, (ushort)nv);
                int prevX = 0, prevY = 0;
                for (int vi = 0; vi < nv; vi++)
                {
                    int x = line.Coords[vi * 2], y = line.Coords[vi * 2 + 1];
                    WriteVarint(xStream, ZigZagEncode(x - prevX));
                    WriteVarint(yStream, ZigZagEncode(y - prevY));
                    prevX = x; prevY = y;
                }
            }
        }

        // Pack: [u32 metaLen][u32 xLen][meta bytes][x bytes][y bytes]
        var metaBytes = meta.ToArray();
        var xBytes = xStream.ToArray();
        var yBytes = yStream.ToArray();

        using var dst = new MemoryStream();
        using var w = new BinaryWriter(dst);
        w.Write((uint)metaBytes.Length);
        w.Write((uint)xBytes.Length);
        w.Write(metaBytes);
        w.Write(xBytes);
        w.Write(yBytes);
        w.Flush();
        return dst.ToArray();
    }

    // ── Strategy 4: Predictive + stream separation (best of both) ───────

    static byte[] PredictiveSeparatedEncode(byte[] v2)
    {
        var p = ParseV2(v2);
        using var meta = new MemoryStream();
        using var xStream = new MemoryStream();
        using var yStream = new MemoryStream();

        WriteU16(meta, p.GridSize);
        WriteU16(meta, (ushort)p.Layers.Count);

        foreach (var layer in p.Layers)
        {
            meta.WriteByte(layer.TypeId);
            meta.WriteByte(layer.R); meta.WriteByte(layer.G); meta.WriteByte(layer.B);
            WriteU16(meta, (ushort)layer.Polygons.Count);
            foreach (var poly in layer.Polygons)
                WritePredictiveSeparated(meta, xStream, yStream, poly.Coords);
        }

        WriteU16(meta, (ushort)p.Contours.Count);
        foreach (var c in p.Contours)
        {
            var hb = BitConverter.GetBytes(c.Height);
            meta.Write(hb, 0, 4);
            meta.WriteByte(c.Flags);
            WriteU16(meta, (ushort)c.Lines.Count);
            foreach (var line in c.Lines)
                WritePredictiveSeparated(meta, xStream, yStream, line.Coords);
        }

        var metaBytes = meta.ToArray();
        var xBytes = xStream.ToArray();
        var yBytes = yStream.ToArray();

        using var dst = new MemoryStream();
        using var w = new BinaryWriter(dst);
        w.Write((uint)metaBytes.Length);
        w.Write((uint)xBytes.Length);
        w.Write(metaBytes);
        w.Write(xBytes);
        w.Write(yBytes);
        w.Flush();
        return dst.ToArray();
    }

    static void WritePredictiveSeparated(Stream meta, Stream xStream, Stream yStream, ushort[] coords)
    {
        int nv = coords.Length / 2;
        WriteU16(meta, (ushort)nv);
        int ppX = 0, ppY = 0, pX = 0, pY = 0;
        for (int vi = 0; vi < nv; vi++)
        {
            int x = coords[vi * 2], y = coords[vi * 2 + 1];
            int predX, predY;
            if (vi < 2) { predX = pX; predY = pY; }
            else { predX = 2 * pX - ppX; predY = 2 * pY - ppY; }
            WriteVarint(xStream, ZigZagEncode(x - predX));
            WriteVarint(yStream, ZigZagEncode(y - predY));
            ppX = pX; ppY = pY; pX = x; pY = y;
        }
    }

    // ── Zigzag encoding (signed → unsigned, small magnitudes → small values) ─

    static uint ZigZagEncode(int value) => (uint)((value << 1) ^ (value >> 31));
    static int ZigZagDecode(uint value) => (int)(value >> 1) ^ -(int)(value & 1);

    // ── Varint encoding (protobuf-style, 7 bits per byte, MSB = continuation) ─

    static void WriteVarint(Stream s, uint value)
    {
        while (value >= 0x80)
        {
            s.WriteByte((byte)(value | 0x80));
            value >>= 7;
        }
        s.WriteByte((byte)value);
    }

    static uint ReadVarint(byte[] buf, ref int pos)
    {
        uint result = 0;
        int shift = 0;
        while (true)
        {
            byte b = buf[pos++];
            result |= (uint)(b & 0x7F) << shift;
            if ((b & 0x80) == 0) break;
            shift += 7;
        }
        return result;
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    static void WriteU16(Stream s, ushort value)
    {
        s.WriteByte((byte)(value & 0xFF));
        s.WriteByte((byte)(value >> 8));
    }

    static ushort ReadU16(byte[] buf, ref int pos)
    {
        ushort value = (ushort)(buf[pos] | (buf[pos + 1] << 8));
        pos += 2;
        return value;
    }

    /// <summary>
    /// Run compression benchmark on a BVEC v2 blob. Returns a report string.
    /// </summary>
    public static string Benchmark(byte[] v1extract, byte[] v2extract, byte[] v3extract, byte[] v4extract)
    {
        // Extraction labels:
        //   v1 = legacy (no second-pass reduction)
        //   v2 = targeted (aggressive north + shallow water reduction)
        //   v3 = uniform (per-layer epsilon, no north penalty)
        //   v4 = hi-fi (half of v3 epsilons, no north penalty)

        int rawV1 = v1extract.Length, rawV2 = v2extract.Length;
        int rawV3 = v3extract.Length, rawV4 = v4extract.Length;
        int compV1 = CompressV3(v1extract).Length, compV2 = CompressV3(v2extract).Length;
        int compV3 = CompressV3(v3extract).Length, compV4 = CompressV3(v4extract).Length;
        int ssV1 = Deflate(StreamSeparatedEncode(v1extract)).Length;
        int ssV2 = Deflate(StreamSeparatedEncode(v2extract)).Length;
        int ssV3 = Deflate(StreamSeparatedEncode(v3extract)).Length;
        int ssV4 = Deflate(StreamSeparatedEncode(v4extract)).Length;

        bool rtOk = v2extract.AsSpan().SequenceEqual(DecompressV3ToV2(CompressV3(v2extract)));

        return $"""
            BVEC Compression Benchmark — Extraction × Format Matrix
            ══════════════════════════════════════════════════════════════════════════════════════════
                                  v1 (legacy)         v2 (targeted)       v3 (uniform)        v4 (hi-fi)
            ──────────────────────────────────────────────────────────────────────────────────────────
            raw:              {rawV1,10:N0}          {rawV2,10:N0}          {rawV3,10:N0}          {rawV4,10:N0}
            delta+deflate:    {compV1,10:N0} ({Pct(compV1, rawV1)})  {compV2,10:N0} ({Pct(compV2, rawV2)})  {compV3,10:N0} ({Pct(compV3, rawV3)})  {compV4,10:N0} ({Pct(compV4, rawV4)})
            stream-sep+def:   {ssV1,10:N0} ({Pct(ssV1, rawV1)})  {ssV2,10:N0} ({Pct(ssV2, rawV2)})  {ssV3,10:N0} ({Pct(ssV3, rawV3)})  {ssV4,10:N0} ({Pct(ssV4, rawV4)})
            ──────────────────────────────────────────────────────────────────────────────────────────
            round-trip:       {(rtOk ? "✓ PASS" : "✗ FAIL")}
            """;
    }

    static byte[] Deflate(byte[] data)
    {
        using var output = new MemoryStream();
        using (var deflate = new DeflateStream(output, CompressionLevel.Optimal, leaveOpen: true))
            deflate.Write(data, 0, data.Length);
        return output.ToArray();
    }

    static string Pct(int part, int whole) => whole == 0 ? "N/A" : $"{100.0 * part / whole:F1}%";
}
