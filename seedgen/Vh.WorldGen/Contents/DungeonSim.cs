namespace Vh.World;

/// <summary>
/// UnityEngine.Vector3 arithmetic in float32, operation for operation, so
/// positions come out bit-identical to the game's (the generator seeds each
/// room's rolls from its integer-truncated position).
/// </summary>
public readonly record struct V3(float x, float y, float z)
{
    public static readonly V3 Zero = new(0f, 0f, 0f);
    public static readonly V3 One = new(1f, 1f, 1f);
    public static V3 operator +(V3 a, V3 b) => new(a.x + b.x, a.y + b.y, a.z + b.z);
    public static V3 operator -(V3 a, V3 b) => new(a.x - b.x, a.y - b.y, a.z - b.z);
    public static V3 operator *(V3 a, float d) => new(a.x * d, a.y * d, a.z * d);
    public static V3 Scale(V3 a, V3 b) => new(a.x * b.x, a.y * b.y, a.z * b.z);

    /// <summary>Vector3.Distance.</summary>
    public static float Distance(V3 a, V3 b)
    {
        float dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
        return (float)Math.Sqrt(dx * dx + dy * dy + dz * dz);
    }

    public static readonly V3 Forward = new(0f, 0f, 1f);
}

/// <summary>UnityEngine.Quaternion, the managed operators verbatim.</summary>
public readonly record struct Quat(float x, float y, float z, float w)
{
    public static readonly Quat Identity = new(0f, 0f, 0f, 1f);

    public static Quat operator *(Quat l, Quat r) => new(
        l.w * r.x + l.x * r.w + l.y * r.z - l.z * r.y,
        l.w * r.y + l.y * r.w + l.z * r.x - l.x * r.z,
        l.w * r.z + l.z * r.w + l.x * r.y - l.y * r.x,
        l.w * r.w - l.x * r.x - l.y * r.y - l.z * r.z);

    public static V3 operator *(Quat q, V3 p)
    {
        float num = q.x * 2f, num2 = q.y * 2f, num3 = q.z * 2f;
        float num4 = q.x * num, num5 = q.y * num2, num6 = q.z * num3;
        float num7 = q.x * num2, num8 = q.x * num3, num9 = q.y * num3;
        float num10 = q.w * num, num11 = q.w * num2, num12 = q.w * num3;
        return new V3(
            (1f - (num5 + num6)) * p.x + (num7 - num12) * p.y + (num8 + num11) * p.z,
            (num7 + num12) * p.x + (1f - (num4 + num6)) * p.y + (num9 - num10) * p.z,
            (num8 - num11) * p.x + (num9 + num10) * p.y + (1f - (num4 + num5)) * p.z);
    }

    /// <summary>Quaternion.Inverse (the conjugate, for the unit quaternions transforms hold).</summary>
    public static Quat Inverse(Quat q) => new(-q.x, -q.y, -q.z, q.w);

    /// <summary>Quaternion.Euler(0, yDegrees, 0).</summary>
    public static Quat EulerY(float yDegrees)
    {
        float half = yDegrees * (MathF.PI / 180f) * 0.5f;
        return new Quat(0f, MathF.Sin(half), 0f, MathF.Cos(half));
    }
}

/// <summary>What one dungeon location spawned: networked objects by prefab name.</summary>
public sealed class DungeonResult
{
    public Dictionary<string, int> Objects { get; } = new();
    /// <summary>Where each <see cref="DungeonSim.MarkedPrefabs"/> object was spawned.</summary>
    public List<(string Prefab, V3 Pos)> Marks { get; } = new();
    /// <summary>Location names the dungeon's vegvisirs reveal, one per vegvisir left active in its rooms.</summary>
    public List<string> Vegvisirs { get; } = new();
    /// <summary>
    /// Objects whose count may be off: rolled by a RandomSpawn/RandomObject that
    /// also refuses lava (m_notInLava), in the Ashlands, where we don't model lava.
    /// The roll still happens, so everything else stays exact.
    /// </summary>
    public HashSet<string> Uncertain { get; } = new();
    public List<string> Rooms { get; } = new();
    public List<V3> RoomPositions { get; } = new();
    public V3 GeneratorPosition { get; set; }
    public int GeneratorSeed { get; set; }
    public int Seed { get; set; }

    internal void Add(string prefab) => Objects[prefab] = Objects.GetValueOrDefault(prefab) + 1;
}

/// <summary>
/// Re-runs Valheim's <c>ZoneSystem.SpawnLocation</c> + <c>DungeonGenerator</c> for a
/// dungeon location from the room catalog — room placement, then every room's
/// RandomSpawn/RandomObject rolls — and reports which networked objects
/// (pickables, spawners, chests…) the game would create. No geometry, no
/// chest contents. A port of the decompiled 1.0 code; names follow it.
///
/// Like the oracle plugin, the location is taken at identity rotation: with
/// m_useCustomInteriorTransform the location's rotation cancels out of the
/// dungeon's transform, and for the rest the game's rotation is unseeded.
///
/// Camps (CampRadial: farms) scatter their rooms over the ground instead, so
/// they need the <see cref="WorldGenerator"/> for the zone's terrain; their
/// layout doesn't depend on the location's rotation at all.
/// </summary>
public sealed class DungeonSim
{
    readonly DungeonCatalog _cat;
    readonly WorldGenerator? _wg;

    public DungeonSim(DungeonCatalog catalog, WorldGenerator? wg = null)
    {
        _cat = catalog;
        _wg = wg;
    }

    public bool Supports(string prefab) =>
        _cat.Locations.TryGetValue(prefab, out var l) && (l.Algorithm is -1 or 0 || (l.Algorithm == 2 && _wg != null));

    /// <summary>
    /// What <see cref="DungeonResult.Marks"/> records (mapped as POIs of their own):
    /// networked pieces by prefab, and rooms by name, at the room's position.
    /// </summary>
    public static readonly HashSet<string> MarkedPrefabs = new() { "piece_maypole", "northvillage_granary" };

    // ── ZoneSystem helpers ───────────────────────────────────────────────

    static (int x, int y) GetZone(V3 p) =>
        ((int)MathF.Floor((float)(((double)p.x + 32.0) / 64.0)), (int)MathF.Floor((float)(((double)p.z + 32.0) / 64.0)));

    static V3 GetZonePos((int x, int y) z) => new(z.x * 64f, 0f, z.y * 64f);

    /// <summary>
    /// Simulate one location instance at <paramref name="pos"/> (the instance
    /// position as ZoneSystem registered it, y = ground height).
    /// </summary>
    public DungeonResult Simulate(string prefab, V3 pos, int worldSeed)
    {
        var loc = _cat.Locations[prefab];
        var result = new DungeonResult();
        var tree = loc.Tree;
        var rot = Quat.Identity;
        var zone = GetZone(pos);
        int seed = worldSeed + zone.x * 4271 + zone.y * 9187;
        // PlaceLocations drops the location onto the zone's terrain collider first.
        ZoneTerrain? terrain = null;
        if (loc.Algorithm == 2)
        {
            terrain = new ZoneTerrain(_wg!, zone);
            if (terrain.Raycast(pos.x, pos.z, pos.y, out float gy, out _)) pos = new V3(pos.x, gy, pos.z);
        }

        // SpawnLocation: with a custom interior transform the generator is moved
        // to the zone's own interior slot, its rotation undoing the location's.
        var locals = new (V3 Pos, Quat Rot)[tree.Nodes.Length];
        for (int i = 0; i < locals.Length; i++) locals[i] = (tree.Nodes[i].Pos, tree.Nodes[i].Rot);
        locals[0] = (V3.Zero, Quat.Identity);   // asset root is zeroed for the spawn
        V3 vector = V3.Zero, vector2 = V3.Zero;
        bool hasInterior = loc.InteriorNode >= 0 && loc.GeneratorNode >= 0;
        if (hasInterior)
        {
            vector = tree.Nodes[loc.InteriorNode].Pos;
            vector2 = tree.Nodes[loc.GeneratorNode].Pos;
        }
        bool flag = loc.UseCustomInteriorTransform && hasInterior;
        if (flag)
        {
            var zonePos = GetZonePos(zone);
            locals[loc.GeneratorNode] = (V3.Zero, locals[loc.GeneratorNode].Rot);
            var v3 = zonePos + vector + vector2 - pos;
            // (Matrix4x4.Rotate(Inverse(rot)) * Matrix4x4.Translate(v3)).GetColumn(3) == v3 at identity.
            var lp3 = new V3(v3.x, tree.Nodes[loc.InteriorNode].Pos.y, v3.z);
            locals[loc.InteriorNode] = (lp3, Quat.Inverse(rot));
        }

        // Location-level rolls (seeded by zone), as SpawnLocation does them.
        UnityRandom.InitState(seed);
        var active = tree.InitialActive();
        var world = WorldTransforms(tree, locals);
        Randomize(tree, active, i => pos + rot * world[i].pos, dgThemes: null, locationBiome: true, pos, result);
        foreach (var vg in tree.Vegvisirs)
        {
            bool on = true;
            for (int n = vg.Node; n >= 0 && on; n = tree.Nodes[n].Parent) on = active[n];
            if (on) result.Vegvisirs.AddRange(vg.Locations);
        }

        foreach (var nv in EnabledNetViews(tree))
        {
            if (!active[nv.Node]) continue;
            result.Add(nv.Prefab);
            if (nv.Node == loc.GeneratorNode && loc.Algorithm is 0 or 2)
            {
                var dgPos = pos + rot * world[nv.Node].pos;
                var dgRot = rot * world[nv.Node].rot;
                var gen = new Generator(this, loc, dgPos, dgRot, flag ? vector2 : loc.OriginalPosition, worldSeed, result, terrain);
                gen.Generate();
            }
        }
        result.Seed = seed;
        return result;
    }

    /// <summary>World pos/rot of every node, composed down from the root.</summary>
    static (V3 pos, Quat rot, V3 scale)[] WorldTransforms(PrefabTree tree, (V3 Pos, Quat Rot)[] locals)
    {
        var w = new (V3 pos, Quat rot, V3 scale)[tree.Nodes.Length];
        for (int i = 0; i < w.Length; i++)
        {
            var n = tree.Nodes[i];
            if (n.Parent < 0) { w[i] = (locals[i].Pos, locals[i].Rot, n.Scale); continue; }
            var p = w[n.Parent];
            w[i] = (p.pos + p.rot * V3.Scale(p.scale, locals[i].Pos), p.rot * locals[i].Rot, V3.Scale(p.scale, n.Scale));
        }
        return w;
    }

    /// <summary>Utils.GetEnabledComponentsInChildren over the prefab's initial (asset) state.</summary>
    static IEnumerable<TreeNetView> EnabledNetViews(PrefabTree t)
    {
        var a = t.InitialActive();
        return t.NetViews.Where(v => v.Node != 0 && t.EnabledUpTo(a, v.Node, 0));
    }

    /// <summary>
    /// RandomSpawn.Randomize then RandomObject.Randomize over the enabled ones,
    /// in order, mutating <paramref name="active"/> exactly as SetSpawned does.
    /// </summary>
    void Randomize(PrefabTree t, bool[] active, Func<int, V3> worldPos, int? dgThemes, bool locationBiome, V3 locPos,
        DungeonResult result)
    {
        bool? ashlands = null;
        // m_notInLava isn't modelled: in the Ashlands, what such a roll spawns may be missing in the game.
        void LavaUnsure(bool notInLava, int node)
        {
            if (!notInLava) return;
            ashlands ??= _wg?.GetBiome(locPos.x, locPos.z) == Biome.AshLands;
            if (ashlands != true) return;
            foreach (var nv in t.NetViews)
                if (t.IsAncestorOrSelf(node, nv.Node)) result.Uncertain.Add(nv.Prefab);
        }
        var initial = t.InitialActive();
        // Prepare(): each RandomSpawn's child ZNetViews, enabled relative to it.
        var spawns = t.RandomSpawns.Where(r => r.Node != 0 && t.EnabledUpTo(initial, r.Node, 0)).ToArray();
        var objects = t.RandomObjects.Where(r => r.Node != 0 && t.EnabledUpTo(initial, r.Node, 0)).ToArray();
        Biome? locBiome = null;
        foreach (var rs in spawns)
        {
            bool spawned = UnityRandom.Range(0f, 100f) <= rs.Chance;
            if (dgThemes is int th && rs.RequireTheme != 0 && (th & rs.RequireTheme) != rs.RequireTheme) spawned = false;
            if (locationBiome && rs.RequireBiome != 0)
            {
                locBiome ??= _wg?.GetBiome(locPos.x, locPos.z);
                if (locBiome is Biome b && ((int)b & rs.RequireBiome) != (int)b) spawned = false;
            }
            if (spawned) LavaUnsure(rs.NotInLava, rs.Node);
            var p = worldPos(rs.Node);
            if (p.y < rs.MinElevation || p.y > rs.MaxElevation) spawned = false;
            if (!spawned)
            {
                active[rs.Node] = false;
                foreach (var nv in t.NetViews)
                    if (t.IsAncestorOrSelf(rs.Node, nv.Node) && t.EnabledUpTo(initial, nv.Node, rs.Node))
                        active[nv.Node] = false;
            }
            else if (t.NetViewAt[rs.Node] < 0)
            {
                active[rs.Node] = true;
            }
            if (rs.OffObject >= 0) active[rs.OffObject] = !spawned;
        }
        foreach (var ro in objects)
        {
            float total = 0f;
            foreach (var o in ro.Objects) total += o.Weight;
            float pick = UnityRandom.Range(0f, total);
            int chosen = -1;
            float acc = 0f;
            foreach (var o in ro.Objects)
            {
                acc += o.Weight;
                if (pick <= acc) { chosen = o.Node; break; }
            }
            bool fail = dgThemes is int th && ro.RequireTheme != 0 && (th & ro.RequireTheme) != ro.RequireTheme;
            if (!fail && locationBiome && ro.RequireBiome != 0)
            {
                locBiome ??= _wg?.GetBiome(locPos.x, locPos.z);
                if (locBiome is Biome b && ((int)b & ro.RequireBiome) != (int)b) fail = true;
            }
            var p = worldPos(ro.Node);
            if (!fail && (p.y < ro.MinElevation || p.y > ro.MaxElevation)) fail = true;
            int spawnObj = fail ? -1 : chosen;
            if (spawnObj >= 0) LavaUnsure(ro.NotInLava, spawnObj);
            foreach (var o in ro.Objects)
            {
                if (o.Node < 0 || o.Node == spawnObj) continue;
                active[o.Node] = false;
                foreach (var nv in t.NetViews) if (t.IsAncestorOrSelf(o.Node, nv.Node)) active[nv.Node] = false;
            }
            if (spawnObj < 0)
            {
                active[ro.Node] = false;
                foreach (var nv in t.NetViews) if (t.IsAncestorOrSelf(ro.Node, nv.Node)) active[nv.Node] = false;
            }
            else if (t.NetViewAt[ro.Node] < 0)
            {
                active[ro.Node] = true;
            }
        }
    }

    // ── DungeonGenerator ─────────────────────────────────────────────────

    sealed class PlacedRoom
    {
        public required CatalogRoom Data;
        public V3 Pos;      // transform.position after parenting under the generator
        public Quat Rot;
        public int PlaceOrder;
    }

    sealed class OpenConnection
    {
        public required PlacedRoom Room;
        public required TreeConnection Def;
        public V3 Pos;
        public Quat Rot;
        public int PlaceOrder;
    }

    sealed class Generator
    {
        readonly DungeonSim _sim;
        readonly CatalogLocation _loc;
        readonly V3 _pos;
        readonly Quat _rot;
        readonly V3 _originalPosition;
        readonly int _worldSeed;
        readonly DungeonResult _result;
        readonly List<CatalogRoom> _available;
        readonly List<PlacedRoom> _placed = new();
        readonly List<OpenConnection> _open = new();
        readonly List<OpenConnection> _doors = new();
        readonly ZoneTerrain? _terrain;
        V3 _zoneCenter;
        int _seed;

        public Generator(DungeonSim sim, CatalogLocation loc, V3 pos, Quat rot, V3 originalPosition, int worldSeed, DungeonResult result,
            ZoneTerrain? terrain = null)
        {
            _sim = sim; _loc = loc; _pos = pos; _rot = rot; _originalPosition = originalPosition;
            _worldSeed = worldSeed; _result = result; _terrain = terrain;
            _available = sim._cat.Rooms.Where(r => (r.ListTheme & loc.Themes) != 0 && r.ListEnabled).ToList();
        }

        int GetSeed()
        {
            var z = GetZone(_pos);
            return unchecked(_worldSeed + z.x * 4271 + z.y * -7187 + (int)_pos.x * -4271 + (int)_pos.y * 9187 + (int)_pos.z * -2134);
        }

        public void Generate()
        {
            _seed = GetSeed();
            _zoneCenter = GetZonePos(GetZone(_pos));
            _zoneCenter = new V3(_zoneCenter.x, _pos.y - _originalPosition.y, _zoneCenter.z);
            UnityRandom.InitState(_seed);
            if (_loc.Algorithm == 2)
                GenerateCampRadial();
            else
            {
                PlaceStartRoom();
                PlaceRooms();
                PlaceEndCaps();
                PlaceDoors();
            }
            foreach (var r in _placed) { _result.Rooms.Add(r.Data.Name); _result.RoomPositions.Add(r.Pos); }
            _result.GeneratorPosition = _pos;
            _result.GeneratorSeed = _seed;
        }

        // ── CampRadial ──────────────────────────────────────────────────────

        /// <summary>
        /// GenerateCampRadial: darts thrown at random spots within a random radius;
        /// a room sticks where the ground is gentle and dry and it doesn't overlap
        /// anything, until enough have. Then the perimeter ring the same way.
        /// </summary>
        void GenerateCampRadial()
        {
            float num = UnityRandom.Range(_loc.CampRadiusMin, _loc.CampRadiusMax);
            float num2 = (float)Math.Cos(MathF.PI / 180f * _loc.MaxTilt);
            int num3 = UnityRandom.Range(_loc.MinRooms, _loc.MaxRooms);
            int num4 = num3 * 20;
            int num5 = 0;
            for (int i = 0; i < num4; i++)
            {
                // Range(0, 360) is evaluated before Range(0f, r).
                var q = Quat.EulerY(UnityRandom.Range(0, 360));
                float dist = UnityRandom.Range(0f, num - _loc.PerimeterBuffer);
                var p = _pos + (q * V3.Forward) * dist;
                var room = GetRandomWeightedRoom(perimeter: false);
                if (room == null) continue;
                if (!GroundOk(ref p, num2)) continue;
                var rot = GetCampRoomRotation(room, p);
                if (!TestCollision(room, p, rot))
                {
                    PlaceRoom(room, p, rot, fromOrder: -1, skipPos: new V3(float.NaN, 0f, 0f));
                    num5++;
                    if (num5 >= num3) break;
                }
            }
            if (_loc.PerimeterSections > 0) PlaceWall(num, _loc.PerimeterSections);
        }

        void PlaceWall(float radius, int sections)
        {
            float num = (float)Math.Cos(MathF.PI / 180f * _loc.MaxTilt);
            int num2 = 0;
            int num3 = sections * 20;
            for (int i = 0; i < num3; i++)
            {
                var room = GetRandomWeightedRoom(perimeter: true);
                if (room == null) continue;
                var p = _pos + (Quat.EulerY(UnityRandom.Range(0, 360)) * V3.Forward) * radius;
                var rot = GetCampRoomRotation(room, p);
                if (!GroundOk(ref p, num)) continue;
                if (!TestCollision(room, p, rot))
                {
                    PlaceRoom(room, p, rot, fromOrder: -1, skipPos: new V3(float.NaN, 0f, 0f));
                    num2++;
                    if (num2 >= sections) break;
                }
            }
        }

        /// <summary>GetGroundData then the tilt/altitude test: false = skip this dart.</summary>
        bool GroundOk(ref V3 p, float minNormalY)
        {
            var normal = new V3(0f, 1f, 0f);
            if (_terrain != null && _terrain.Raycast(p.x, p.z, p.y, out float y, out var n))
            {
                p = new V3(p.x, y, p.z);
                normal = n;
            }
            return !(normal.y < minNormalY || p.y - 30f < _loc.MinAltitude);
        }

        Quat GetCampRoomRotation(CatalogRoom room, V3 pos)
        {
            if (room.FaceCenter)
            {
                var v = _pos - pos;
                v = new V3(v.x, 0f, v.z);
                if (v == V3.Zero) v = V3.Forward;
                // Vector3.Normalize
                float mag = (float)Math.Sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
                v = mag > 1E-05f ? new V3(v.x / mag, v.y / mag, v.z / mag) : V3.Zero;
                // Utils.YawFromDirection, then Mathf.Round (banker's) to 22.5°.
                float yaw = 57.29578f * (float)Math.Atan2(v.x, v.z);
                while (yaw >= 360f) yaw -= 360f;
                while (yaw < 0f) yaw += 360f;
                float y = (float)Math.Round(yaw / 22.5f) * 22.5f;
                return Quat.EulerY(y);
            }
            return Quat.EulerY(UnityRandom.Range(0, 16) * 22.5f);
        }

        CatalogRoom? GetRandomWeightedRoom(bool perimeter)
        {
            var temp = new List<CatalogRoom>();
            float total = 0f;
            foreach (var r in _available)
            {
                if (!r.Entrance && !r.EndCap && !r.Divider && r.Perimeter == perimeter)
                {
                    total += r.Weight;
                    temp.Add(r);
                }
            }
            if (temp.Count == 0) return null;
            float pick = UnityRandom.Range(0f, total);
            float acc = 0f;
            foreach (var r in temp)
            {
                acc += r.Weight;
                if (pick <= acc) return r;
            }
            return temp[0];
        }

        // Asset-side connections: GetComponentsInChildren on the untouched prefab.
        static IEnumerable<TreeConnection> AssetConnections(CatalogRoom r)
        {
            var a = r.Tree.InitialActive();
            return r.Tree.Connections.Where(c => r.Tree.EnabledUpTo(a, c.Node, 0));
        }

        static bool HaveConnection(CatalogRoom r, string type) => AssetConnections(r).Any(c => c.Type == type);

        static (V3 pos, Quat rot) CalculateRoomPosRot(CatalogRoom room, TreeConnection con, V3 exitPos, Quat exitRot)
        {
            var n = room.Tree.Nodes[con.Node];
            var rot = exitRot * Quat.Inverse(n.Rot);
            return (exitPos - rot * n.Pos, rot);
        }

        void PlaceStartRoom()
        {
            var entrances = _available.Where(r => r.Entrance).ToList();
            var room = entrances[UnityRandom.Range(0, entrances.Count)];
            var entrance = AssetConnections(room).First(c => c.Entrance);
            var (pos, rot) = CalculateRoomPosRot(room, entrance, _pos, _rot);
            // fromConnection is the prefab's own entrance (m_placeOrder 0), at its asset position.
            PlaceRoom(room, pos, rot, fromOrder: 0, skipPos: AssetPos(room, entrance.Node));
        }

        static V3 AssetPos(CatalogRoom room, int node)
        {
            var t = room.Tree;
            var chain = new List<int>();
            for (int n = node; n >= 0; n = t.Nodes[n].Parent) chain.Add(n);
            V3 p = V3.Zero; Quat q = Quat.Identity; V3 s = V3.One;
            for (int i = chain.Count - 1; i >= 0; i--)
            {
                var nd = t.Nodes[chain[i]];
                p = p + q * V3.Scale(s, nd.Pos);
                q = q * nd.Rot;
                s = V3.Scale(s, nd.Scale);
            }
            return p;
        }

        void PlaceRooms()
        {
            for (int i = 0; i < _loc.MaxRooms; i++)
            {
                PlaceOneRoom();
                if (CheckRequiredRooms() && _placed.Count > _loc.MinRooms) break;
            }
        }

        bool CheckRequiredRooms()
        {
            if (_loc.MinRequiredRooms == 0 || _loc.RequiredRooms.Length == 0) return false;
            int n = _placed.Count(r => _loc.RequiredRooms.Contains(r.Data.Name));
            return n >= _loc.MinRequiredRooms;
        }

        bool PlaceOneRoom()
        {
            if (_open.Count == 0) return false;
            var con = _open[UnityRandom.Range(0, _open.Count)];
            for (int i = 0; i < 10; i++)
            {
                var room = _loc.AlternativeFunctionality ? GetRandomWeightedRoom(con) : GetRandomRoom(con);
                if (room == null) break;
                if (PlaceRoom(con, room)) return true;
            }
            return false;
        }

        List<CatalogRoom> Candidates(OpenConnection con) => _available.Where(r =>
            !r.Entrance && !r.EndCap && !r.Divider && HaveConnection(r, con.Def.Type) && con.PlaceOrder >= r.MinPlaceOrder).ToList();

        CatalogRoom? GetRandomWeightedRoom(OpenConnection con)
        {
            var temp = Candidates(con);
            return temp.Count == 0 ? null : GetWeightedRoom(temp);
        }

        CatalogRoom? GetRandomRoom(OpenConnection con)
        {
            var temp = Candidates(con);
            return temp.Count == 0 ? null : temp[UnityRandom.Range(0, temp.Count)];
        }

        static CatalogRoom GetWeightedRoom(List<CatalogRoom> rooms)
        {
            float total = 0f;
            foreach (var r in rooms) total += r.Weight;
            float pick = UnityRandom.Range(0f, total);
            float acc = 0f;
            foreach (var r in rooms)
            {
                acc += r.Weight;
                if (pick <= acc) return r;
            }
            return rooms[0];
        }

        /// <summary>PlaceRoom(RoomConnection, RoomData): fit a room onto an open connection.</summary>
        bool PlaceRoom(OpenConnection con, CatalogRoom room)
        {
            var rotation = con.Rot * Quat.EulerY(180f);
            // Room.GetConnection: a random connection of the same type.
            var same = AssetConnections(room).Where(c => c.Type == con.Def.Type).ToList();
            var con2 = same[UnityRandom.Range(0, same.Count)];
            var (pos, rot) = CalculateRoomPosRot(room, con2, con.Pos, rotation);
            if (room.Size.x != 0f && room.Size.z != 0f && TestCollision(room, pos, rot)) return false;
            PlaceRoom(room, pos, rot, con.PlaceOrder, con.Pos);
            if (!room.EndCap)
            {
                if (con.Def.AllowDoor && (!con.Def.DoorOnlyIfOther || con2.AllowDoor)) _doors.Add(con);
                _open.Remove(con);
            }
            return true;
        }

        /// <summary>PlaceRoom(RoomData, pos, rot, fromConnection): roll its contents and register it.</summary>
        PlacedRoom PlaceRoom(CatalogRoom room, V3 pos, Quat rot, int fromOrder, V3 skipPos)
        {
            var t = room.Tree;
            var v = _loc.GeneratorUseCustomInteriorTransform ? pos - _pos : pos;
            int num = unchecked((int)v.x * 4271 + (int)v.y * 9187 + (int)v.z * 2134);
            if (_loc.AddBaseSeedToRandomSpawn) num = unchecked(num + _seed);

            var saved = UnityRandom.GetState();
            UnityRandom.InitState(num);
            var active = t.InitialActive();
            // RandomSpawn positions: the asset's world position relative to its root, placed.
            var rootPos = t.Nodes[0].Pos;
            var rootRotInv = Quat.Inverse(t.Nodes[0].Rot);
            _sim.Randomize(t, active, i => pos + rot * (rootRotInv * (AssetWorld(room, i) - rootPos)),
                _loc.Themes, locationBiome: false, pos, _result);
            var enabledViews = EnabledNetViews(t).ToList();
            foreach (var nv in enabledViews)
            {
                if (!active[nv.Node]) continue;
                _result.Add(nv.Prefab);
                if (MarkedPrefabs.Contains(nv.Prefab))
                    _result.Marks.Add((nv.Prefab, pos + rot * (rootRotInv * (AssetWorld(room, nv.Node) - rootPos))));
            }
            UnityRandom.SetState(saved.Item1, saved.Item2, saved.Item3, saved.Item4);

            // The instance is cloned from the prefab in its rolled state, with every
            // ZNetView switched off first, so connections under them don't exist.
            foreach (var nv in enabledViews) active[nv.Node] = false;
            // Vegvisirs are plain scenery: present when the rolls left their branch active.
            foreach (var vg in t.Vegvisirs)
                if (InstanceActive(t, active, vg.Node)) _result.Vegvisirs.AddRange(vg.Locations);

            // Instantiate(prefab, pos, rot, generator): stored local to the generator.
            var localPos = Quat.Inverse(_rot) * (pos - _pos);
            var localRot = Quat.Inverse(_rot) * rot;
            var placed = new PlacedRoom
            {
                Data = room,
                Pos = _pos + _rot * localPos,
                Rot = _rot * localRot,
                PlaceOrder = fromOrder + 1,
            };
            _placed.Add(placed);
            if (MarkedPrefabs.Contains(room.Name)) _result.Marks.Add((room.Name, placed.Pos));

            // AddOpenConnections: the instance's active connections, minus entrances
            // and the one we came in through.
            foreach (var c in t.Connections)
            {
                if (!InstanceActive(t, active, c.Node)) continue;
                var (cp, cr) = InstanceWorld(placed, c.Node);
                if (c.Entrance || V3.Distance(cp, skipPos) < 0.1f) continue;
                _open.Add(new OpenConnection { Room = placed, Def = c, Pos = cp, Rot = cr, PlaceOrder = placed.PlaceOrder });
            }
            return placed;
        }

        static bool InstanceActive(PrefabTree t, bool[] active, int node)
        {
            for (int n = node; n >= 0; n = t.Nodes[n].Parent) if (!active[n]) return false;
            return true;
        }

        static V3 AssetWorld(CatalogRoom room, int node) => AssetPos(room, node);

        /// <summary>World pos/rot of a node inside a placed room instance.</summary>
        (V3, Quat) InstanceWorld(PlacedRoom room, int node)
        {
            var t = room.Data.Tree;
            var chain = new List<int>();
            for (int n = node; n > 0; n = t.Nodes[n].Parent) chain.Add(n);
            // Generator -> room -> ... -> node, as the transform hierarchy composes it.
            var localPos = Quat.Inverse(_rot) * (room.Pos - _pos);
            V3 p = _pos + _rot * localPos;
            Quat q = _rot * (Quat.Inverse(_rot) * room.Rot);
            V3 s = V3.One;
            for (int i = chain.Count - 1; i >= 0; i--)
            {
                var nd = t.Nodes[chain[i]];
                p = p + q * V3.Scale(s, nd.Pos);
                q = q * nd.Rot;
                s = V3.Scale(s, nd.Scale);
            }
            return (p, q);
        }

        void PlaceEndCaps()
        {
            for (int i = 0; i < _open.Count; i++)
            {
                var con = _open[i];
                OpenConnection? other = null;
                for (int j = 0; j < _open.Count; j++)
                {
                    if (j != i && V3.Distance(con.Pos, _open[j].Pos) < 0.1f) { other = _open[j]; break; }
                }
                if (other != null)
                {
                    if (con.Def.Type != other.Def.Type)
                    {
                        var dividers = _available.Where(r => r.Divider).ToList();
                        Shuffle(dividers);
                        if (dividers.Count > 0)
                        {
                            var room = GetWeightedRoom(dividers);
                            var first = AssetConnections(room).First();
                            var (pos, rot) = CalculateRoomPosRot(room, first, con.Pos, con.Rot);
                            bool exists = _placed.Any(p => p.Data.Divider && V3.Distance(p.Pos, pos) < 0.5f);
                            if (!exists) PlaceRoom(room, pos, rot, con.PlaceOrder, con.Pos);
                        }
                    }
                    continue;
                }
                var caps = _available.Where(r => r.EndCap && HaveConnection(r, con.Def.Type)).ToList();
                Shuffle(caps);
                bool done = false;
                if (_loc.AlternativeFunctionality && caps.Count > 0)
                {
                    for (int k = 0; k < 5; k++)
                    {
                        if (PlaceRoom(con, GetWeightedRoom(caps))) { done = true; break; }
                    }
                }
                if (!done)
                {
                    foreach (var room in caps.OrderByDescending(r => r.EndCapPrio))
                        if (PlaceRoom(con, room)) break;
                }
            }
        }

        /// <summary>PlaceDoors: a door type per door connection, then its spawn chance.</summary>
        void PlaceDoors()
        {
            foreach (var con in _doors)
            {
                var types = _loc.DoorTypes.Where(d => d.ConnectionType == con.Def.Type).ToList();
                if (types.Count == 0) continue;
                var door = types[UnityRandom.Range(0, types.Count)];
                // (!(chance > 0) || !(value > chance)) && (!(chance <= 0) || !(value > doorChance)):
                // exactly one roll either way.
                bool place = door.Chance > 0f ? !(UnityRandom.Value() > door.Chance) : !(UnityRandom.Value() > _loc.DoorChance);
                if (place) _result.Add(door.Prefab);
            }
        }

        /// <summary>ShuffleClass.Shuffle(useUnityRandom: true).</summary>
        static void Shuffle<T>(List<T> list)
        {
            int num = list.Count;
            while (num > 1)
            {
                num--;
                int k = UnityRandom.Range(0, num);
                (list[k], list[num]) = (list[num], list[k]);
            }
        }

        bool TestCollision(CatalogRoom room, V3 pos, Quat rot)
        {
            if (!IsInsideDungeon(room, pos, rot)) return true;
            var a = new V3(room.Size.x - 0.1f, room.Size.y - 0.1f, room.Size.z - 0.1f);
            foreach (var p in _placed)
                if (BoxesOverlap(a, pos, rot, p.Data.Size, p.Pos, p.Rot)) return true;
            return false;
        }

        bool IsInsideDungeon(CatalogRoom room, V3 pos, Quat rot)
        {
            var half = room.Size * 0.5f;
            var e = _loc.ZoneSize * 0.5f;
            V3 min = _zoneCenter - e, max = _zoneCenter + e;
            foreach (var sx in new[] { 1f, -1f })
            foreach (var sy in new[] { 1f, -1f })
            foreach (var sz in new[] { -1f, 1f })
            {
                var c = pos + rot * new V3(half.x * sx, half.y * sy, half.z * sz);
                if (c.x < min.x || c.x > max.x || c.y < min.y || c.y > max.y || c.z < min.z || c.z > max.z) return false;
            }
            return true;
        }

        /// <summary>Physics.ComputePenetration between two box colliders: overlap by
        /// the separating axis test (15 axes).</summary>
        static bool BoxesOverlap(V3 sizeA, V3 posA, Quat rotA, V3 sizeB, V3 posB, Quat rotB)
        {
            double[][] A = Axes(rotA), B = Axes(rotB);
            double[] ha = { sizeA.x * 0.5, sizeA.y * 0.5, sizeA.z * 0.5 };
            double[] hb = { sizeB.x * 0.5, sizeB.y * 0.5, sizeB.z * 0.5 };
            double[] T = { posB.x - posA.x, posB.y - posA.y, posB.z - posA.z };
            var axes = new List<double[]>();
            axes.AddRange(A);
            axes.AddRange(B);
            foreach (var u in A) foreach (var w in B) axes.Add(Cross(u, w));
            foreach (var L in axes)
            {
                double len = Math.Sqrt(Dot(L, L));
                if (len < 1e-6) continue;
                double ra = 0, rb = 0;
                for (int i = 0; i < 3; i++) { ra += ha[i] * Math.Abs(Dot(A[i], L)); rb += hb[i] * Math.Abs(Dot(B[i], L)); }
                if (Math.Abs(Dot(T, L)) >= ra + rb) return false;
            }
            return true;
        }

        static double[][] Axes(Quat q) => new[]
        {
            Vec(q * new V3(1f, 0f, 0f)), Vec(q * new V3(0f, 1f, 0f)), Vec(q * new V3(0f, 0f, 1f)),
        };
        static double[] Vec(V3 v) => new double[] { v.x, v.y, v.z };
        static double Dot(double[] a, double[] b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        static double[] Cross(double[] a, double[] b) =>
            new[] { a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0] };
    }
}
