using System;
using System.Buffers.Binary;
using System.IO;
using StbImageSharp;

namespace ValHelpApi.ModuleTrack.Rendering;

/// <summary>
/// Decodes map textures (the game's PNG caches, also uploaded via POST api/track/map)
/// to raw 8-bit pixel rows. PNG only: the signature and IHDR size are checked before
/// any decoding, so no other format's parser is reachable from an upload.
/// </summary>
public static class PngPixels
{
    static ReadOnlySpan<byte> Signature => [0x89, (byte)'P', (byte)'N', (byte)'G', 0x0D, 0x0A, 0x1A, 0x0A];

    /// <summary>Largest side accepted; game textures are a few thousand pixels.</summary>
    public const int MaxSide = 16384;

    public static ImageResult Decode(string path, ColorComponents components)
        => Decode(File.ReadAllBytes(path), components);

    public static ImageResult Decode(byte[] png, ColorComponents components)
    {
        // Signature (8) + IHDR length/type (8) + width/height (8).
        if (png.Length < 24 || !png.AsSpan(0, 8).SequenceEqual(Signature)
            || !png.AsSpan(12, 4).SequenceEqual("IHDR"u8))
            throw new InvalidDataException("Not a PNG image");

        uint w = BinaryPrimitives.ReadUInt32BigEndian(png.AsSpan(16, 4));
        uint h = BinaryPrimitives.ReadUInt32BigEndian(png.AsSpan(20, 4));
        if (w == 0 || h == 0 || w > MaxSide || h > MaxSide)
            throw new InvalidDataException($"PNG size {w}x{h} out of range");

        return ImageResult.FromMemory(png, components);
    }
}
