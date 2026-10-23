namespace Vh.World;

/// <summary>
/// One zone's terrain collider as the game builds it when the zone first loads:
/// <c>HeightmapBuilder.Build</c>'s 65×65 vertex grid at 1 m (corner biomes
/// blended across the zone), triangulated like <c>Heightmap.RebuildCollisionMesh</c>.
/// <see cref="Raycast"/> stands in for <c>ZoneSystem.GetGroundData</c>'s downward
/// ray: the hit height and the face normal of the triangle it lands on.
///
/// Only the zone itself is modelled. A ray outside it hits whatever neighbour
/// happens to be loaded in the game (which depends on where the player came
/// from), so it counts as a miss here, as it does when the oracle builds the
/// zone on its own.
/// </summary>
public sealed class ZoneTerrain
{
    const int Width = 64;      // the zone prefab's Heightmap: m_width 64, m_scale 1
    const int Verts = Width + 1;
    readonly float[] _h = new float[Verts * Verts];
    readonly float _x0, _z0;   // world position of vertex (0, 0)
    readonly float _cx, _cz;   // zone centre: the mesh's local origin

    public (int x, int y) Zone { get; }

    public ZoneTerrain(WorldGenerator wg, (int x, int y) zone)
    {
        Zone = zone;
        _cx = zone.x * 64f; _cz = zone.y * 64f;
        // Zone centre minus half the width, as Build and CalcVertex place it.
        _x0 = _cx - Width * 0.5f; _z0 = _cz - Width * 0.5f;
        float vx = _x0, vz = _z0, far = Width;
        var b0 = wg.GetBiome(vx, vz);
        var b1 = wg.GetBiome((float)(vx + (double)far), vz);
        var b2 = wg.GetBiome(vx, (float)(vz + (double)far));
        var b3 = wg.GetBiome((float)(vx + (double)far), (float)(vz + (double)far));
        bool uniform = b1 == b0 && b2 == b0 && b3 == b0;
        for (int k = 0; k < Verts; k++)
        {
            float wy = (float)(vz + k * 1.0);
            float t = DUtils.SmoothStep(0f, 1f, (float)((double)k / Width));
            for (int l = 0; l < Verts; l++)
            {
                float wx = (float)(vx + l * 1.0);
                float h;
                if (uniform)
                    h = wg.GetBiomeHeight(b0, wx, wy, out _, out _, out _, out _);
                else
                {
                    float t2 = DUtils.SmoothStep(0f, 1f, (float)((double)l / Width));
                    float h0 = wg.GetBiomeHeight(b0, wx, wy, out _, out _, out _, out _);
                    float h1 = wg.GetBiomeHeight(b1, wx, wy, out _, out _, out _, out _);
                    float h2 = wg.GetBiomeHeight(b2, wx, wy, out _, out _, out _, out _);
                    float h3 = wg.GetBiomeHeight(b3, wx, wy, out _, out _, out _, out _);
                    h = DUtils.Lerp(DUtils.Lerp(h0, h1, t2), DUtils.Lerp(h2, h3, t2), t);
                }
                _h[k * Verts + l] = h;
            }
        }
    }

    /// <summary>
    /// The terrain under (x, z), for a ray cast straight down from
    /// <paramref name="originY"/> + 5000 as GetGroundData does: height and unit
    /// face normal, or false when the point is outside this zone.
    /// </summary>
    public bool Raycast(float x, float z, float originY, out float y, out V3 normal)
    {
        float lx = x - _x0, lz = z - _z0;
        y = 0f; normal = new V3(0f, 1f, 0f);
        if (!(lx >= 0f && lz >= 0f && lx <= Width && lz <= Width)) return false;
        int l0 = Math.Min((int)lx, Width - 1), k0 = Math.Min((int)lz, Width - 1);
        // Cell (k row/z, l column/x) holds triangles (k,l)(k+1,l)(k,l+1) and
        // (k,l+1)(k+1,l)(k+1,l+1), split along the diagonal from (k+1,l) to (k,l+1);
        // triangle index (k*64 + l)*2, +1 for the second. On an edge or a vertex the
        // ray hits several; PhysX keeps the nearest as its float32 ray/triangle test
        // computes it, and on a tie the lowest index (checked against the oracle).
        // Camps sit at zone centres, so darts thrown at 0/90/180/270° land on grid
        // lines and those at 135/315° on cell diagonals.
        V3 o = new(x - _cx, originY + 5000f, z - _cz);
        (V3 a, V3 b, V3 c)? best = null;
        float bestT = float.MaxValue;
        for (int k = Math.Max(k0 - 1, 0); k <= k0; k++)
        for (int l = Math.Max(l0 - 1, 0); l <= l0; l++)
        foreach (bool first in new[] { true, false })
        {
            var tri = Triangle(k, l, first);
            if (RayHit(tri, o, out float t) && t < bestT) { bestT = t; best = tri; }
        }
        // Rounding never leaves a point inside the mesh without a hit in PhysX;
        // should it here, take the triangle that contains it.
        var (a, b, c) = best ?? Triangle(k0, l0, (lx - l0) + (lz - k0) <= 1f);
        // Face normal, up-facing (the ray comes from above).
        double e1x = b.x - a.x, e1y = b.y - a.y, e1z = b.z - a.z;
        double e2x = c.x - a.x, e2y = c.y - a.y, e2z = c.z - a.z;
        double nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
        if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
        double len = Math.Sqrt(nx * nx + ny * ny + nz * nz);
        normal = new V3((float)(nx / len), (float)(ny / len), (float)(nz / len));
        // Height on that plane.
        y = (float)(a.y - (nx * (x - a.x) + nz * (z - a.z)) / ny);
        return true;
    }

    /// <summary>
    /// Möller–Trumbore as PhysX does it, in float32 and the mesh's local space
    /// (zone centre at the origin), for a straight-down ray from <paramref name="o"/>.
    /// </summary>
    bool RayHit((V3 a, V3 b, V3 c) tri, V3 o, out float t)
    {
        V3 v0 = new(tri.a.x - _cx, tri.a.y, tri.a.z - _cz);
        V3 v1 = new(tri.b.x - _cx, tri.b.y, tri.b.z - _cz);
        V3 v2 = new(tri.c.x - _cx, tri.c.y, tri.c.z - _cz);
        V3 e1 = v1 - v0, e2 = v2 - v0;
        // pvec = (0,-1,0) x e2
        V3 pvec = new(-e2.z, 0f, e2.x);
        float inv = 1f / (e1.x * pvec.x + e1.y * pvec.y + e1.z * pvec.z);
        V3 tv = o - v0;
        float u = (tv.x * pvec.x + tv.y * pvec.y + tv.z * pvec.z) * inv;
        V3 q = new(tv.y * e1.z - tv.z * e1.y, tv.z * e1.x - tv.x * e1.z, tv.x * e1.y - tv.y * e1.x);
        float v = -q.y * inv;
        t = (e2.x * q.x + e2.y * q.y + e2.z * q.z) * inv;
        return !(u < 0f || u > 1f || v < 0f || u + v > 1f);
    }

    V3 Vertex(int k, int l) => new(_x0 + l, _h[k * Verts + l], _z0 + k);

    (V3, V3, V3) Triangle(int k, int l, bool first) => first
        ? (Vertex(k, l), Vertex(k + 1, l), Vertex(k, l + 1))
        : (Vertex(k, l + 1), Vertex(k + 1, l), Vertex(k + 1, l + 1));
}
