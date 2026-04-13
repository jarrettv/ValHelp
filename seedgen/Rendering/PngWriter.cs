using System;
using System.IO;
using System.IO.Compression;

namespace Vh.Rendering;

/// <summary>
/// Minimal PNG writer. Writes an uncompressed RGB24 or RGBA32 PNG.
/// </summary>
public static class PngWriter
{
    public static void WritePngRgb(string path, int width, int height, byte[] rgb)
    {
        using var fs = File.Create(path);
        WritePng(fs, width, height, rgb, bpp: 3, colorType: 2);
    }

    public static void WritePngRgba(string path, int width, int height, byte[] rgba)
    {
        using var fs = File.Create(path);
        WritePng(fs, width, height, rgba, bpp: 4, colorType: 6);
    }

    private static void WritePng(Stream s, int width, int height, byte[] pixels, int bpp, byte colorType)
    {
        // Signature
        s.Write(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A });

        // IHDR
        var ihdr = new byte[13];
        WriteInt32BE(ihdr, 0, width);
        WriteInt32BE(ihdr, 4, height);
        ihdr[8] = 8; // bit depth
        ihdr[9] = colorType; // 2=RGB, 6=RGBA
        ihdr[10] = 0; // compression
        ihdr[11] = 0; // filter
        ihdr[12] = 0; // interlace
        WriteChunk(s, "IHDR", ihdr);

        // IDAT - filtered raw data then deflate
        int rowBytes = width * bpp;
        var raw = new byte[(rowBytes + 1) * height]; // +1 per row for filter byte
        for (int y = 0; y < height; y++)
        {
            int srcRow = (height - 1 - y); // flip vertically (Unity textures are bottom-up)
            raw[y * (rowBytes + 1)] = 0; // filter: None
            Buffer.BlockCopy(pixels, srcRow * rowBytes, raw, y * (rowBytes + 1) + 1, rowBytes);
        }

        using var ms = new MemoryStream();
        // zlib header
        ms.WriteByte(0x78);
        ms.WriteByte(0x01);
        using (var deflate = new DeflateStream(ms, CompressionLevel.Optimal, leaveOpen: true))
        {
            deflate.Write(raw, 0, raw.Length);
        }
        // Adler32
        uint adler = Adler32(raw);
        ms.WriteByte((byte)(adler >> 24));
        ms.WriteByte((byte)(adler >> 16));
        ms.WriteByte((byte)(adler >> 8));
        ms.WriteByte((byte)adler);

        WriteChunk(s, "IDAT", ms.ToArray());

        // IEND
        WriteChunk(s, "IEND", Array.Empty<byte>());
    }

    private static void WriteChunk(Stream s, string type, byte[] data)
    {
        var lenBytes = new byte[4];
        WriteInt32BE(lenBytes, 0, data.Length);
        s.Write(lenBytes);

        var typeBytes = new byte[] { (byte)type[0], (byte)type[1], (byte)type[2], (byte)type[3] };
        s.Write(typeBytes);
        s.Write(data);

        // CRC32 over type + data
        uint crc = Crc32(typeBytes, data);
        var crcBytes = new byte[4];
        WriteInt32BE(crcBytes, 0, (int)crc);
        s.Write(crcBytes);
    }

    private static void WriteInt32BE(byte[] buf, int offset, int value)
    {
        buf[offset] = (byte)(value >> 24);
        buf[offset + 1] = (byte)(value >> 16);
        buf[offset + 2] = (byte)(value >> 8);
        buf[offset + 3] = (byte)value;
    }

    private static uint Adler32(byte[] data)
    {
        uint a = 1, b = 0;
        for (int i = 0; i < data.Length; i++)
        {
            a = (a + data[i]) % 65521;
            b = (b + a) % 65521;
        }
        return (b << 16) | a;
    }

    // CRC32 with PNG polynomial
    private static readonly uint[] CrcTable;
    static PngWriter()
    {
        CrcTable = new uint[256];
        for (uint n = 0; n < 256; n++)
        {
            uint c = n;
            for (int k = 0; k < 8; k++)
                c = (c & 1) != 0 ? 0xEDB88320u ^ (c >> 1) : c >> 1;
            CrcTable[n] = c;
        }
    }

    private static uint Crc32(byte[] type, byte[] data)
    {
        uint crc = 0xFFFFFFFF;
        for (int i = 0; i < type.Length; i++)
            crc = CrcTable[(crc ^ type[i]) & 0xFF] ^ (crc >> 8);
        for (int i = 0; i < data.Length; i++)
            crc = CrcTable[(crc ^ data[i]) & 0xFF] ^ (crc >> 8);
        return crc ^ 0xFFFFFFFF;
    }
}
