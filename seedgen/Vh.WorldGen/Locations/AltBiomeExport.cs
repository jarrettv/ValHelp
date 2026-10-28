using System.Globalization;
using System.Text;

namespace Vh.World.Locations;

/// <summary>
/// The biome variants (alt biomes) of a world in the oracle's format, which is what
/// the web map's variant overlay reads (`/api/worlds/{seed}/altbiomes` and
/// `/altbiomegrid`, web/src/components/biomePatterns.ts). Mirrors DumpAltBiomes in
/// seedgen/oracle/OraclePlugin.cs; checked against it in Vh.WorldGen.Tests.
/// </summary>
public static class AltBiomeExport
{
    /// <summary>The sectors that carry a variant, in sector order (oracle.altbiomes.json).</summary>
    public static string Json(BiomeData data)
    {
        var sb = new StringBuilder("[\n");
        bool first = true;
        foreach (var s in data.Sectors)
        {
            if (s.AltBiomes.Count == 0) continue;
            sb.Append(first ? "" : ",\n");
            first = false;
            sb.Append("{\"index\":").Append(s.Index).Append(",\"biome\":\"").Append(s.Biome.ToString()).Append("\",\"edge\":").Append(s.EdgeCount)
              .Append(",\"cx\":").Append(F(s.Center.x)).Append(",\"cy\":").Append(F(s.Center.y))
              .Append(",\"min\":[").Append(F(s.Min.x)).Append(',').Append(F(s.Min.y))
              .Append("],\"max\":[").Append(F(s.Max.x)).Append(',').Append(F(s.Max.y)).Append("],\"alts\":[");
            for (int i = 0; i < s.AltBiomes.Count; i++)
                sb.Append(i > 0 ? "," : "").Append('"').Append(s.AltBiomes[i].Name).Append('"');
            sb.Append("]}");
        }
        return sb.Append("\n]\n").ToString();
    }

    /// <summary>Which listed sector each minimap cell is in (oracle.altbiomes.u8, before gzip):
    /// 1 + its entry in <see cref="Json"/>'s list, 0 for none; row-major, x = world x, y = world z.</summary>
    public static byte[] Grid(BiomeData data)
    {
        var entry = new byte[data.Sectors.Count];
        int n = 0;
        foreach (var s in data.Sectors)
            if (s.AltBiomes.Count > 0 && n < 255) entry[s.Index] = (byte)++n;
        var grid = new byte[BiomeData.Size * BiomeData.Size];
        for (int k = 0; k < grid.Length; k++)
            if (data.PointSectors[k] is { } sec) grid[k] = entry[sec.Index];
        return grid;
    }

    static string F(float v) => v.ToString("R", CultureInfo.InvariantCulture);
}
