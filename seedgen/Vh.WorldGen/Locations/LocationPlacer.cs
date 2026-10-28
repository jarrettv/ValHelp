using System.Diagnostics;

namespace Vh.World.Locations;

/// <summary>A placed location: its type and position (y = terrain height there).</summary>
public readonly record struct PlacedLocation(LocationRule Rule, float X, float Y, float Z)
{
    public (short X, short Y) Zone => LocationPlacer.ZoneOf(X, Z);
}

/// <summary>
/// The game's location placement (ZoneSystem.GenerateLocations), for a fresh
/// world: every location type in turn tries random zones, picked through the
/// biome data, and up to six random points in each, until it has its quantity
/// or runs out of attempts.
///
/// Resumable, like the game's own time-sliced coroutine: <see cref="Run"/> works
/// for a time budget and returns, so a Web Worker can post <see cref="Progress"/>
/// between calls (the server just calls <see cref="RunToEnd"/>). It uses Unity's
/// global RNG (<see cref="UnityRandom"/>) as the game does, saving and restoring
/// its state across calls, so nothing else may draw from it while a run is
/// paused mid-way.
///
/// Placement is sequential by nature: each type sees the zones and positions
/// the earlier ones took.
/// </summary>
public sealed class LocationPlacer
{
    readonly WorldGenerator _wg;
    readonly BiomeData _biomes;
    readonly int _seed;
    readonly List<LocationRule> _ordered;
    readonly Dictionary<(short, short), PlacedLocation> _byZone = new();
    readonly List<PlacedLocation> _placed = new();
    // HaveLocationInRange's caches: placed instances by prefab, by group, by max group.
    readonly Dictionary<string, List<PlacedLocation>> _byPrefab = new(), _byGroup = new(), _byGroupMax = new();
    // GetBiomeArea / GetBiome(Vector2s) caches, as the game's.
    readonly Dictionary<(short, short), int> _biomeAreas = new();
    readonly Dictionary<(short, short), Biome> _biomesAt = new();
    readonly IEnumerator<bool> _steps;
    (uint, uint, uint, uint)? _rng;
    int _typesDone;

    public LocationPlacer(WorldGenerator wg, BiomeData biomes, IEnumerable<LocationRule> rules)
    {
        _wg = wg;
        _biomes = biomes;
        _seed = wg.GetSeed();
        // Prioritized first, otherwise the game's order (LINQ's OrderByDescending is stable);
        // disabled types and those with no quantity drop out.
        _ordered = rules.OrderByDescending(r => r.Prioritized).Where(r => r.Enable && r.Quantity != 0).ToList();
        _steps = Steps().GetEnumerator();
    }

    public IReadOnlyList<PlacedLocation> Placed => _placed;
    public bool Done { get; private set; }
    /// <summary>Location types finished, 0-1 (the game's own progress measure).</summary>
    public float Progress => _ordered.Count == 0 ? 1f : (float)_typesDone / _ordered.Count;
    /// <summary>The type being placed now, for a progress label.</summary>
    public LocationRule? Current { get; private set; }

    /// <summary>Place for up to <paramref name="budget"/>; true once every type is done.</summary>
    public bool Run(TimeSpan budget)
    {
        if (Done) return true;
        var saved = UnityRandom.GetState();
        if (_rng is { } r) UnityRandom.SetState(r.Item1, r.Item2, r.Item3, r.Item4);
        var sw = Stopwatch.StartNew();
        try
        {
            while (sw.Elapsed < budget)
            {
                if (!_steps.MoveNext()) { Done = true; break; }
            }
        }
        finally
        {
            _rng = UnityRandom.GetState();
            UnityRandom.SetState(saved.Item1, saved.Item2, saved.Item3, saved.Item4);
        }
        return Done;
    }

    public IReadOnlyList<PlacedLocation> RunToEnd()
    {
        while (!Run(TimeSpan.FromSeconds(10))) { }
        return _placed;
    }

    // Yield (a chance to pause) every this many points tried.
    const int YieldEvery = 64;

    IEnumerable<bool> Steps()
    {
        int sinceYield = 0;
        foreach (var location in _ordered)
        {
            Current = location;
            UnityRandom.InitState(_seed + StableHash.GetStableHashCode(location.Prefab));
            float maxRadius = Math.Max(location.ExteriorRadius, location.InteriorRadius);
            int attempts = location.Prioritized ? 60000 : 12000;
            int placed = 0;   // a fresh world has none yet (CountNrOfLocation)
            float maxRange = 10000f;
            var tempVeg = new List<float>();
            if (!location.Unique || placed <= 0)
            {
                if (location.CenterFirst) maxRange = location.MinDistance;
                for (int i = 0; i < attempts && placed < location.Quantity; i++)
                {
                    if (++sinceYield >= YieldEvery) { sinceYield = 0; yield return false; }
                    (short X, short Y) zone;
                    if (location.CenterFirst) zone = RandomZone(maxRange);
                    else
                    {
                        var pt = location.MinAltitude < 0f
                            ? _biomes.RandomPointByBiomes(location.Biome)
                            : _biomes.RandomPointByBiomesAboveSeaLevel(location.Biome);
                        zone = ZoneOf(BiomeData.MapToWorld(pt.X), BiomeData.MapToWorld(pt.Y));
                    }
                    if (location.CenterFirst) maxRange += 1f;
                    if (_byZone.ContainsKey(zone)) continue;
                    // (Zones already generated would be skipped too; a fresh world has none.)
                    var center = ((short)(zone.X * 64), (short)(zone.Y * 64));
                    if ((location.BiomeArea & BiomeAreaAt(center)) == 0) continue;
                    for (int j = 0; j < 6; j++)
                    {
                        if (TryPoint(location, zone, maxRadius, tempVeg, out var p))
                        {
                            Register(location, p);
                            placed++;   // counted even if Register found the zone taken, as the game does
                            break;
                        }
                    }
                }
            }
            _typesDone++;
            yield return false;
        }
        Current = null;
    }

    /// <summary>One random point in the zone, checked against every rule (the inner loop's body).</summary>
    bool TryPoint(LocationRule location, (short X, short Y) zone, float maxRadius, List<float> tempVeg, out (float X, float Y, float Z) p)
    {
        // GetRandomPointInZone
        float zx = zone.X * 64f, zz = zone.Y * 64f;
        float rx = UnityRandom.Range(-32f + maxRadius, 32f - maxRadius);
        float rz = UnityRandom.Range(-32f + maxRadius, 32f - maxRadius);
        float px = zx + rx, py = 0f, pz = zz + rz;
        p = (px, py, pz);

        // Vector3.magnitude (float expression evaluated in double under Mono)
        float magnitude = (float)Math.Sqrt((double)px * px + (double)py * py + (double)pz * pz);
        if (location.MinDistance != 0f && magnitude < location.MinDistance) return false;
        if (location.MaxDistance != 0f && magnitude > location.MaxDistance) return false;

        var biome = _wg.GetBiome(px, pz);
        if ((location.Biome & biome) == 0) return false;

        py = _wg.GetHeight(px, pz, out float maskA);
        p = (px, py, pz);
        float alt = (float)((double)py - 30.0);
        if (alt < location.MinAltitude || alt > location.MaxAltitude) return false;

        if (location.InForest)
        {
            float ff = WorldGenerator.GetForestFactor(new Vector3(px, py, pz));
            if (ff < location.ForestTresholdMin || ff > location.ForestTresholdMax) return false;
        }

        if (location.MinDistanceFromCenter > 0f || location.MaxDistanceFromCenter > 0f)
        {
            float lxz = (float)Math.Sqrt((double)px * px + (double)pz * pz);   // Utils.LengthXZ
            if ((location.MinDistanceFromCenter > 0f && lxz < location.MinDistanceFromCenter) ||
                (location.MaxDistanceFromCenter > 0f && lxz > location.MaxDistanceFromCenter))
                return false;
        }

        _wg.GetTerrainDelta(px, pz, location.ExteriorRadius, out float delta);
        if (delta > location.MaxTerrainDelta || delta < location.MinTerrainDelta) return false;

        if (location.MinDistanceFromSimilar > 0f &&
            HaveLocationInRange(location.Prefab, location.Group, p, location.MinDistanceFromSimilar, maxGroup: false))
            return false;
        if (location.MaxDistanceFromSimilar > 0f &&
            !HaveLocationInRange(location.Prefab, location.GroupMax, p, location.MaxDistanceFromSimilar, maxGroup: true))
            return false;

        if (location.MinimumVegetation > 0f && maskA <= location.MinimumVegetation) return false;
        if (location.MaximumVegetation < 1f && maskA >= location.MaximumVegetation) return false;

        var sector = _biomes.SectorAt(px, pz);
        if (sector != null)
        {
            if (location.AltBiomeParent != null && !sector.AltBiomes.Any(a => a.Name == location.AltBiomeParent)) return false;
            if (sector.AltBiomes.Any(a => a.BlockLocationNames.Contains(location.Name))) return false;
        }
        else if (location.AltBiomeParent != null) return false;   // the game's empty sector has no alt biomes

        if (location.SurroundCheckVegetation)
        {
            float sum = 0f;
            for (int layer = 0; layer < location.SurroundCheckLayers; layer++)
            {
                float dist = (float)(layer + 1) / location.SurroundCheckLayers * location.SurroundCheckDistance;
                for (int k = 0; k < 6; k++)
                {
                    float f = (float)k / 6f * MathF.PI * 2f;
                    float vx = px + (float)Math.Sin(f) * dist, vz = pz + (float)Math.Cos(f) * dist;
                    _wg.GetHeight(vx, vz, out float a2);
                    float weight = (location.SurroundCheckDistance - dist) / (location.SurroundCheckDistance * 2f);
                    sum += a2 * weight;
                }
            }
            tempVeg.Add(sum);
            if (tempVeg.Count < 10) return false;
            float max = tempVeg.Max(), avg = tempVeg.Average();
            float cutoff = avg + (max - avg) * location.SurroundBetterThanAverage;
            if (sum < cutoff) return false;
        }
        return true;
    }

    void Register(LocationRule location, (float X, float Y, float Z) p)
    {
        var zone = ZoneOf(p.X, p.Z);
        if (_byZone.ContainsKey(zone)) return;   // "Location already exist in zone": not added
        var pl = new PlacedLocation(location, p.X, p.Y, p.Z);
        _byZone.Add(zone, pl);
        _placed.Add(pl);
        Add(_byPrefab, location.Prefab, pl);
        Add(_byGroup, location.Group, pl);
        Add(_byGroupMax, location.GroupMax, pl);

        static void Add(Dictionary<string, List<PlacedLocation>> cache, string key, PlacedLocation pl)
        {
            if (!cache.TryGetValue(key, out var list)) cache[key] = list = new List<PlacedLocation>();
            list.Add(pl);
        }
    }

    bool HaveLocationInRange(string prefab, string group, (float X, float Y, float Z) p, float radius, bool maxGroup)
    {
        if (_byPrefab.TryGetValue(prefab, out var a) && AnyWithin(a)) return true;
        if (group.Length > 0 && !maxGroup && _byGroup.TryGetValue(group, out var b) && AnyWithin(b)) return true;
        if (group.Length > 0 && maxGroup && _byGroupMax.TryGetValue(group, out var c) && AnyWithin(c)) return true;
        return false;

        bool AnyWithin(List<PlacedLocation> l)
        {
            // (m_position - p).sqrMagnitude < radius * radius, Unity float maths under Mono
            double r2 = (double)radius * radius;
            foreach (var q in l)
            {
                float dx = q.X - p.X, dy = q.Y - p.Y, dz = q.Z - p.Z;
                if ((float)((double)dx * dx + (double)dy * dy + (double)dz * dz) < r2) return true;
            }
            return false;
        }
    }

    /// <summary>GetRandomZone (centerFirst types: zones spiralling out from the middle).</summary>
    static (short X, short Y) RandomZone(float range)
    {
        int num = (int)range / 64;
        (short X, short Y) z;
        do
        {
            int x = UnityRandom.Range(-num, num);
            int y = UnityRandom.Range(-num, num);
            z = ((short)x, (short)y);
        } while (!((float)Math.Sqrt((double)(z.X * 64f) * (z.X * 64f) + (double)(z.Y * 64f) * (z.Y * 64f)) < 10000f));
        return z;
    }

    /// <summary>ZoneSystem.GetZone.</summary>
    public static (short X, short Y) ZoneOf(float x, float z) =>
        ((short)(int)Math.Floor((float)(((double)x + 32.0) / 64.0)), (short)(int)Math.Floor((float)(((double)z + 32.0) / 64.0)));

    /// <summary>WorldGenerator.GetBiomeArea(Vector2s): Edge (1) if any of the 8 neighbours 64 m away differ, else Median (2).</summary>
    int BiomeAreaAt((short X, short Y) p)
    {
        if (_biomeAreas.TryGetValue(p, out int area)) return area;
        var b = BiomeAt(p);
        ReadOnlySpan<(short, short)> offsets = [(-64, -64), (64, -64), (64, 64), (-64, 64), (-64, 0), (64, 0), (0, -64), (0, 64)];
        area = 2;
        foreach (var (ox, oy) in offsets)
            if (BiomeAt(((short)(p.X - ox), (short)(p.Y - oy))) != b) { area = 1; break; }
        _biomeAreas.Add(p, area);
        return area;
    }

    Biome BiomeAt((short X, short Y) p)
    {
        if (_biomesAt.TryGetValue(p, out var b)) return b;
        b = _wg.GetBiome(p.X, p.Y);
        _biomesAt.Add(p, b);
        return b;
    }
}
