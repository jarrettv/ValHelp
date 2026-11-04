using System.IO.Compression;
using System.Text;

namespace Vh.Character;

/// <summary>
/// Reader for the game's ZPackage encoding: little-endian primitives,
/// .NET 7-bit-length UTF-8 strings, int-prefixed byte arrays, and gzip for
/// compressed sub-packages (Utils.Compress).
/// </summary>
public sealed class GameReader
{
    private readonly BinaryReader _r;

    public GameReader(byte[] data)
    {
        Length = data.Length;
        _r = new BinaryReader(new MemoryStream(data, writable: false), Encoding.UTF8);
    }

    public int Length { get; }
    public long Position => _r.BaseStream.Position;
    public bool AtEnd => _r.BaseStream.Position >= Length;

    public int Int() => _r.ReadInt32();
    public uint UInt() => _r.ReadUInt32();
    public long Long() => _r.ReadInt64();
    public float Float() => _r.ReadSingle();
    public bool Bool() => _r.ReadBoolean();
    public byte Byte() => _r.ReadByte();
    public ushort UShort() => _r.ReadUInt16();
    public string String() => _r.ReadString();
    public Vec3 Vec3() => new(_r.ReadSingle(), _r.ReadSingle(), _r.ReadSingle());

    public byte[] ByteArray() => Bytes(Int());

    public byte[] Bytes(int count)
    {
        var bytes = _r.ReadBytes(count);
        if (bytes.Length != count) throw new EndOfStreamException($"wanted {count} bytes, got {bytes.Length}");
        return bytes;
    }

    /// <summary>ZPackage.ReadNumItems: 1 byte, or 2 when the high bit is set.</summary>
    public int NumItems()
    {
        int n = _r.ReadByte();
        if ((n & 0x80) != 0) n = ((n & 0x7F) << 8) | _r.ReadByte();
        return n;
    }

    public GameReader CompressedPackage() => new(Gunzip(ByteArray()));

    public static byte[] Gunzip(byte[] data)
    {
        using var gz = new GZipStream(new MemoryStream(data), CompressionMode.Decompress);
        using var ms = new MemoryStream();
        gz.CopyTo(ms);
        return ms.ToArray();
    }

    public Dictionary<string, float> StringFloatMap()
    {
        int n = Int();
        var map = new Dictionary<string, float>(n);
        for (int i = 0; i < n; i++) map[String()] = Float();
        return map;
    }

    public Dictionary<string, string> StringStringMap()
    {
        int n = Int();
        var map = new Dictionary<string, string>(n);
        for (int i = 0; i < n; i++) map[String()] = String();
        return map;
    }

    public List<string> StringList()
    {
        int n = Int();
        var list = new List<string>(n);
        for (int i = 0; i < n; i++) list.Add(String());
        return list;
    }

    public Dictionary<int, int> IntIntMap()
    {
        int n = Int();
        var map = new Dictionary<int, int>(n);
        for (int i = 0; i < n; i++) map[Int()] = Int();
        return map;
    }
}

public readonly record struct Vec3(float X, float Y, float Z);
