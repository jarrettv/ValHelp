namespace Vh.WorldGen.Tests;

/// <summary>
/// The game's river network, as seedgen/oracle/OraclePlugin.cs WriteRivers lays
/// it out: lakes, rivers, streams, then the river points per 64 m grid cell
/// (cells sorted by y then x, points in the game's order).
/// </summary>
public sealed record RiverDump(
    (float X, float Y)[] Lakes,
    float[][] Rivers,     // p0.x, p0.y, p1.x, p1.y, center.x, center.y, widthMin, widthMax, curveWidth, curveWavelength
    float[][] Streams,
    ((int X, int Y) Cell, (float X, float Y, float W)[] Points)[] Grids)
{
    public static RiverDump Read(byte[] data)
    {
        using var r = new BinaryReader(new MemoryStream(data));
        var lakes = new (float, float)[r.ReadInt32()];
        for (int i = 0; i < lakes.Length; i++) lakes[i] = (r.ReadSingle(), r.ReadSingle());
        float[][] ReadRivers()
        {
            var list = new float[r.ReadInt32()][];
            for (int i = 0; i < list.Length; i++)
            {
                list[i] = new float[10];
                for (int k = 0; k < 10; k++) list[i][k] = r.ReadSingle();
            }
            return list;
        }
        var rivers = ReadRivers();
        var streams = ReadRivers();
        var grids = new ((int, int), (float, float, float)[])[r.ReadInt32()];
        for (int i = 0; i < grids.Length; i++)
        {
            var cell = (r.ReadInt32(), r.ReadInt32());
            var pts = new (float, float, float)[r.ReadInt32()];
            for (int k = 0; k < pts.Length; k++) pts[k] = (r.ReadSingle(), r.ReadSingle(), r.ReadSingle());
            grids[i] = (cell, pts);
        }
        return new RiverDump(lakes, rivers, streams, grids);
    }
}
