using System.Security.Cryptography;

namespace Vh.Character;

/// <summary>A parsed .fch character profile (PlayerProfile).</summary>
public sealed class CharacterProfile
{
    /// <summary>Version.Player (47 = 1.0.21 "CheatCleanSlate").</summary>
    public int Version { get; init; }
    public string Name { get; set; } = "";
    public long PlayerId { get; set; }
    public string StartSeed { get; set; } = "";
    public bool UsedCheats { get; set; }
    /// <summary>Creation date (unix seconds in the file; null before Stats2).</summary>
    public DateTimeOffset? Created { get; set; }
    public bool FirstSpawn { get; set; } = true;
    /// <summary>
    /// Stats per difficulty slot (10 since DeepNorth). Slot 0 is the running
    /// total across difficulties; the game also adds to the slot for the
    /// current achievement difficulty. Older saves fill slot 0 only.
    /// </summary>
    public List<PlayerStats> Stats { get; } = [];
    public List<WorldPlayerData> Worlds { get; } = [];
    public PlayerData? Player { get; set; }
    /// <summary>The stored SHA-512 of the profile package matched its bytes.</summary>
    public bool HashValid { get; set; }
}

public sealed class PlayerStats
{
    /// <summary>Indexed by PlayerStatType; see <see cref="GameNames.PlayerStat"/>.</summary>
    public float[] Values { get; set; } = [];
    /// <summary>World name -> seconds played there. Grows on every save.</summary>
    public Dictionary<string, float> KnownWorlds { get; set; } = [];
    /// <summary>"globalkey value" -> seconds played with that world setting.</summary>
    public Dictionary<string, float> KnownWorldKeys { get; set; } = [];
    public Dictionary<string, float> KnownCommands { get; set; } = [];
    /// <summary>Kill counts per enemy, one map per star level bucket (5).</summary>
    public List<Dictionary<string, float>> EnemyStats { get; set; } = [];
    public Dictionary<string, float> ItemPickups { get; set; } = [];
    public Dictionary<string, float> ItemCrafts { get; set; } = [];
    public Dictionary<string, float> Pickables { get; set; } = [];
    public Dictionary<string, float> FoodEaten { get; set; } = [];
    public Dictionary<string, float> PiecesPlaced { get; set; } = [];
}

/// <summary>What the character remembers about one world, keyed by world UID.</summary>
public sealed class WorldPlayerData
{
    public long WorldUid { get; init; }
    public Vec3? CustomSpawn { get; set; }
    public Vec3? Logout { get; set; }
    public Vec3? Death { get; set; }
    public Vec3 Home { get; set; }
    public MapData? Map { get; set; }
}

/// <summary>Minimap save (Minimap.GetMapData): fog of war and pins for one world.</summary>
public sealed class MapData
{
    /// <summary>Version.Map (8 = PinsAuthor).</summary>
    public int Version { get; init; }
    /// <summary>Explored grid is Size x Size (Minimap.m_textureSize), centred on the world origin.</summary>
    public int Size { get; set; }
    /// <summary>Explored by this character, bit-packed row-major (index = y * Size + x, bit i in byte i/8, LSB first).</summary>
    public byte[] Explored { get; set; } = [];
    /// <summary>Explored by others and shared via a cartography table. Empty before NewExplore.</summary>
    public byte[] ExploredOthers { get; set; } = [];
    public List<MapPin> Pins { get; } = [];
    /// <summary>"Visible on map" toggle. Null before VisibleOnMap.</summary>
    public bool? PublicPosition { get; set; }

    /// <summary>
    /// World metres per cell (Minimap.m_pixelSize on the prefab). Cell of a
    /// world point: x = round(wx / CellSize + Size / 2), y = round(wz / CellSize + Size / 2).
    /// </summary>
    public const float CellSize = 12f;

    public (int X, int Y) CellOf(float wx, float wz) =>
        (RoundToInt(wx / CellSize + Size / 2), RoundToInt(wz / CellSize + Size / 2));

    /// <summary>Utils.RoundToInt (round half up, not banker's).</summary>
    private static int RoundToInt(float f) => (int)(f + 64000.5f) - 64000;

    public bool IsExplored(int x, int y) => Bit(Explored, y * Size + x);
    public bool IsExploredByOthers(int x, int y) => Bit(ExploredOthers, y * Size + x);

    public int ExploredCount => PopCount(Explored);
    public int ExploredOthersCount => PopCount(ExploredOthers);

    private static bool Bit(byte[] bits, int i) => i >> 3 < bits.Length && (bits[i >> 3] & (1 << (i & 7))) != 0;

    private static int PopCount(byte[] bits)
    {
        int n = 0;
        foreach (var b in bits) n += System.Numerics.BitOperations.PopCount(b);
        return n;
    }
}

public sealed record MapPin(string Name, Vec3 Pos, int Type, bool Checked, long OwnerId, string Author)
{
    public string TypeName => GameNames.PinType(Type);
}

/// <summary>The player's own state (Player.Save), nested inside the profile.</summary>
public sealed class PlayerData
{
    /// <summary>Version.PlayerData (34 = PostLaunch).</summary>
    public int Version { get; init; }
    public float MaxHealth { get; set; }
    public float Health { get; set; }
    public float MaxStamina { get; set; }
    public float Stamina { get; set; }
    public float MaxEitr { get; set; }
    public float Eitr { get; set; }
    public float TimeSinceDeath { get; set; }
    public string GuardianPower { get; set; } = "";
    public float GuardianPowerCooldown { get; set; }
    public Inventory Inventory { get; set; } = new();
    public List<string> KnownRecipes { get; set; } = [];
    public Dictionary<string, int> KnownStations { get; set; } = [];
    public List<string> KnownMaterials { get; set; } = [];
    public List<string> ShownTutorials { get; set; } = [];
    public List<string> Uniques { get; set; } = [];
    public List<string> Trophies { get; set; } = [];
    public List<string> KnownBiomes { get; set; } = [];
    public Dictionary<string, string> KnownTexts { get; set; } = [];
    public string Beard { get; set; } = "";
    public string Hair { get; set; } = "";
    public Vec3 SkinColor { get; set; }
    public Vec3 HairColor { get; set; }
    public int Model { get; set; }
    public List<Food> Foods { get; set; } = [];
    public List<Skill> Skills { get; set; } = [];
    public Dictionary<string, string> CustomData { get; set; } = [];
    /// <summary>Build menu layout (Hud.m_buildUi.SaveToBinary), opaque.</summary>
    public byte[] BuildUi { get; set; } = [];
    /// <summary>CharacterDrop pseudo-random drop counters.</summary>
    public Dictionary<int, int> DropCounters { get; set; } = [];
    /// <summary>Forge of Potential upgrade roll seeds.</summary>
    public Dictionary<int, int> UpgradeSeeds { get; set; } = [];
}

public sealed record Food(string Name, float Time);

public sealed record Skill(int Type, float Level, float Accumulator)
{
    public string Name => GameNames.Skill(Type);
}

public sealed class Inventory
{
    /// <summary>Version.Item (110 = NewCheats). From 108 (Smaller) items are stored by prefab hash.</summary>
    public int Version { get; set; }
    public List<InventoryItem> Items { get; } = [];
}

/// <summary>An inventory item. Newer saves have only <see cref="PrefabHash"/> (StableHash of the prefab name); older ones only <see cref="Name"/>.</summary>
public sealed class InventoryItem
{
    public string? Name { get; set; }
    public int PrefabHash { get; set; }
    public int Stack { get; set; }
    public float Durability { get; set; }
    public int GridX { get; set; }
    public int GridY { get; set; }
    public bool Equipped { get; set; }
    public int Quality { get; set; } = 1;
    public int Variant { get; set; }
    public long CrafterId { get; set; }
    public string CrafterName { get; set; } = "";
    public Dictionary<string, string> CustomData { get; set; } = [];
    public int WorldLevel { get; set; }
    public bool PickedUp { get; set; }
    public bool Cheated { get; set; }
}

/// <summary>Parses .fch files. Mirrors PlayerProfile.LoadPlayerFromDisk / Player.Load / Minimap.SetMapData in 1.0.21.</summary>
public static class CharacterFile
{
    // Version.Player
    private const int PStats = 28, PMapData = 29, PDeathPoint = 30, POldest = 27, PStats2 = 38,
        PFirstSpawn = 40, PCallToArms = 42, PAbandonedDN = 44, PDeepNorth = 46, PLatest = 47;

    // Version.PlayerData
    private const int DOriginal = 2, DSkinHair = 4, DSkinHairColor = 5, DUniques = 6, DMaxHealth = 7,
        DFirstSpawn = 8, DTrophies = 9, DMaxStamina = 10, DPlayerModel = 11, DFood = 12, DBurnRate = 13,
        DFood2 = 14, DStations = 15, DFoodStamina = 16, DSkills = 17, DKnownBiomes = 18,
        DRemoveTutorials = 19, DTimeSinceDeath = 20, DReAddTutorials = 21, DKnownTexts = 22,
        DGuardianPower = 23, DGuardianPowerCooldown = 24, DFoodTime = 25, DEitrStamina = 26,
        DMovedFirstSpawn = 28, DAbandonedDN = 31, DChunkedNorth = 33, DPostLaunch = 34;

    // Version.Map
    private const int MPins = 2, MPinsChecked = 3, MVisibleOnMap = 4, MNewExplore = 5,
        MPinsOwnerID = 6, MCompressed = 7, MPinsAuthor = 8;

    // Version.Item
    private const int IQuality = 101, IVariant = 102, ICrafterID = 103, ICustomData = 104,
        IWorldLevel = 105, IPickedUp = 106, IAbandonedDN = 107, ISmaller = 108, IChunksNCheats = 109,
        INewCheats = 110;

    public static CharacterProfile Read(string path) => Parse(File.ReadAllBytes(path));

    /// <summary>File layout: int length, profile package, int length, SHA-512 of the package.</summary>
    public static CharacterProfile Parse(byte[] file)
    {
        var outer = new GameReader(file);
        var data = outer.ByteArray();
        var hash = outer.ByteArray();
        var profile = ParseProfile(new GameReader(data));
        profile.HashValid = SHA512.HashData(data).AsSpan().SequenceEqual(hash);
        return profile;
    }

    private static CharacterProfile ParseProfile(GameReader r)
    {
        int v = r.Int();
        if (v < POldest || v > PLatest) throw new InvalidDataException($"unsupported character version {v}");
        var p = new CharacterProfile { Version = v };

        bool deepNorth = v >= PDeepNorth || v == PAbandonedDN;
        if (deepNorth)
        {
            int statCount = r.Int();
            int slots = r.Int();
            for (int i = 0; i < slots; i++)
            {
                var s = new PlayerStats { Values = new float[statCount] };
                for (int j = 0; j < statCount; j++) s.Values[j] = r.Float();
                s.KnownWorlds = r.StringFloatMap();
                s.KnownWorldKeys = r.StringFloatMap();
                s.KnownCommands = r.StringFloatMap();
                int buckets = r.Int();
                for (int k = 0; k < buckets; k++) s.EnemyStats.Add(r.StringFloatMap());
                s.ItemPickups = r.StringFloatMap();
                s.ItemCrafts = r.StringFloatMap();
                s.Pickables = r.StringFloatMap();
                s.FoodEaten = r.StringFloatMap();
                s.PiecesPlaced = r.StringFloatMap();
                p.Stats.Add(s);
            }
        }
        else if (v >= PStats2)
        {
            int statCount = r.Int();
            var s = new PlayerStats { Values = new float[statCount] };
            for (int j = 0; j < statCount; j++) s.Values[j] = r.Float();
            p.Stats.Add(s);
        }
        else if (v >= PStats)
        {
            // EnemyKills = 6, Deaths = 0, CraftsOrUpgrades = 1, Builds = 2
            var s = new PlayerStats { Values = new float[7] };
            s.Values[6] = r.Int();
            s.Values[0] = r.Int();
            s.Values[1] = r.Int();
            s.Values[2] = r.Int();
            p.Stats.Add(s);
        }

        if (v >= PFirstSpawn) p.FirstSpawn = r.Bool();

        int worlds = r.Int();
        for (int i = 0; i < worlds; i++)
        {
            var w = new WorldPlayerData { WorldUid = r.Long() };
            bool haveSpawn = r.Bool();
            var spawn = r.Vec3();
            bool haveLogout = r.Bool();
            var logout = r.Vec3();
            w.CustomSpawn = haveSpawn ? spawn : null;
            w.Logout = haveLogout ? logout : null;
            if (v >= PDeathPoint)
            {
                bool haveDeath = r.Bool();
                var death = r.Vec3();
                w.Death = haveDeath ? death : null;
            }
            w.Home = r.Vec3();
            if (v >= PMapData && r.Bool()) w.Map = ParseMap(r.ByteArray());
            p.Worlds.Add(w);
        }

        p.Name = r.String();
        p.PlayerId = r.Long();
        p.StartSeed = r.String();
        if (v >= PStats2)
        {
            p.UsedCheats = r.Bool();
            p.Created = DateTimeOffset.FromUnixTimeSeconds(r.Long());
            if (!deepNorth)
            {
                var s = p.Stats[0];
                s.KnownWorlds = r.StringFloatMap();
                s.KnownWorldKeys = r.StringFloatMap();
                s.KnownCommands = r.StringFloatMap();
                if (v >= PCallToArms)
                {
                    s.EnemyStats.Add(r.StringFloatMap());
                    s.ItemPickups = r.StringFloatMap();
                    s.ItemCrafts = r.StringFloatMap();
                }
            }
        }

        if (r.Bool()) p.Player = ParsePlayer(new GameReader(r.ByteArray()));
        if (!r.AtEnd) throw new InvalidDataException($"{r.Length - r.Position} unread bytes after profile");
        return p;
    }

    public static MapData ParseMap(byte[] bytes)
    {
        var r = new GameReader(bytes);
        int v = r.Int();
        if (v >= MCompressed)
        {
            var inner = r.CompressedPackage();
            if (!r.AtEnd) throw new InvalidDataException("unread bytes after compressed map");
            r = inner;
        }
        var m = new MapData { Version = v, Size = r.Int() };
        int cells = m.Size * m.Size;
        if (v >= MNewExplore)
        {
            m.Explored = Pack(r.Bytes(cells));
            m.ExploredOthers = Pack(r.Bytes(cells));
        }
        else
        {
            m.Explored = Pack(r.Bytes(cells)); // one ReadBool per cell
        }
        if (v >= MPins)
        {
            int n = r.Int();
            for (int i = 0; i < n; i++)
            {
                string name = r.String();
                var pos = r.Vec3();
                int type = r.Int();
                bool isChecked = v >= MPinsChecked && r.Bool();
                long owner = v >= MPinsOwnerID ? r.Long() : 0;
                string author = v >= MPinsAuthor ? r.String() : "";
                m.Pins.Add(new MapPin(name, pos, type, isChecked, owner, author));
            }
        }
        if (v >= MVisibleOnMap) m.PublicPosition = r.Bool();
        if (!r.AtEnd) throw new InvalidDataException($"{r.Length - r.Position} unread bytes after map data");
        return m;
    }

    /// <summary>One byte per cell (0 / non-zero) to one bit per cell.</summary>
    private static byte[] Pack(byte[] cells)
    {
        var bits = new byte[(cells.Length + 7) / 8];
        for (int i = 0; i < cells.Length; i++)
            if (cells[i] != 0) bits[i >> 3] |= (byte)(1 << (i & 7));
        return bits;
    }

    private static PlayerData ParsePlayer(GameReader r)
    {
        int v = r.Int();
        var d = new PlayerData { Version = v };
        if (v >= DMaxHealth) d.MaxHealth = r.Float();
        d.Health = r.Float();
        if (v >= DMaxStamina) d.Stamina = d.MaxStamina = r.Float();
        if (v >= DFirstSpawn && v < DMovedFirstSpawn) r.Bool();
        if (v >= DTimeSinceDeath) d.TimeSinceDeath = r.Float();
        if (v >= DGuardianPower) d.GuardianPower = r.String();
        if (v >= DGuardianPowerCooldown) d.GuardianPowerCooldown = r.Float();
        if (v == DOriginal) { r.Long(); r.UInt(); } // ZDOID
        d.Inventory = ParseInventory(r);
        d.KnownRecipes = r.StringList();
        if (v < DStations)
        {
            r.StringList();
        }
        else
        {
            int n = r.Int();
            for (int i = 0; i < n; i++) d.KnownStations[r.String()] = r.Int();
        }
        d.KnownMaterials = r.StringList();
        if (v < DRemoveTutorials || v >= DReAddTutorials) d.ShownTutorials = r.StringList();
        if (v >= DUniques) d.Uniques = r.StringList();
        if (v >= DTrophies) d.Trophies = r.StringList();
        if (v >= DChunkedNorth || v == DAbandonedDN)
        {
            d.KnownBiomes = r.StringList();
        }
        else if (v >= DKnownBiomes)
        {
            int n = r.Int();
            for (int i = 0; i < n; i++) d.KnownBiomes.Add(GameNames.Biome(r.Int()));
        }
        if (v >= DKnownTexts) d.KnownTexts = r.StringStringMap();
        if (v >= DSkinHair)
        {
            d.Beard = r.String();
            d.Hair = r.String();
        }
        if (v >= DSkinHairColor)
        {
            d.SkinColor = r.Vec3();
            d.HairColor = r.Vec3();
        }
        if (v >= DPlayerModel) d.Model = r.Int();
        if (v >= DFood)
        {
            int n = r.Int();
            for (int i = 0; i < n; i++)
            {
                if (v >= DFood2)
                {
                    string name = r.String();
                    float time = 0;
                    if (v >= DFoodTime) time = r.Float();
                    else
                    {
                        r.Float();
                        if (v >= DFoodStamina) r.Float();
                    }
                    d.Foods.Add(new Food(name, time));
                }
                else
                {
                    r.String();
                    for (int k = 0; k < 6; k++) r.Float();
                    if (v >= DBurnRate) r.Float();
                }
            }
        }
        if (v >= DSkills)
        {
            int sv = r.Int();
            int n = r.Int();
            for (int i = 0; i < n; i++)
            {
                int type = r.Int();
                float level = r.Float();
                float acc = sv >= 2 ? r.Float() : 0f;
                d.Skills.Add(new Skill(type, level, acc));
            }
        }
        if (v >= DEitrStamina)
        {
            d.CustomData = r.StringStringMap();
            d.Stamina = r.Float();
            d.MaxEitr = r.Float();
            d.Eitr = r.Float();
        }
        if (v >= DChunkedNorth || v == DAbandonedDN) d.BuildUi = r.ByteArray();
        if (v >= DPostLaunch)
        {
            d.DropCounters = r.IntIntMap();
            d.UpgradeSeeds = r.IntIntMap();
        }
        if (!r.AtEnd) throw new InvalidDataException($"{r.Length - r.Position} unread bytes after player data");
        return d;
    }

    private static Inventory ParseInventory(GameReader r)
    {
        var inv = new Inventory { Version = r.Int() };
        int v = inv.Version;
        if (v >= ISmaller)
        {
            int n = r.UShort();
            for (int i = 0; i < n; i++)
            {
                var it = new InventoryItem
                {
                    Durability = r.Int() * 0.01f,
                    GridX = r.Byte(),
                    GridY = r.Byte(),
                    WorldLevel = r.Byte(),
                };
                byte f = r.Byte();
                it.PickedUp = (f & 1) != 0;
                it.Equipped = (f & 2) != 0;
                it.Quality = (f & 4) == 0 ? 1 : r.UShort();
                it.Stack = (f & 8) == 0 ? 1 : r.UShort();
                it.Variant = (f & 0x10) != 0 ? r.Int() : 0;
                if ((f & 0x20) != 0)
                {
                    it.CrafterId = r.Long();
                    it.CrafterName = r.String();
                }
                it.PrefabHash = (f & 0x40) != 0 ? r.Int() : 0;
                int custom = (f & 0x80) != 0 ? r.NumItems() : 0;
                for (int k = 0; k < custom; k++) it.CustomData[r.String()] = r.String();
                if (v >= IChunksNCheats || v == IAbandonedDN)
                {
                    byte cheat = r.Byte();
                    if (v >= INewCheats) it.Cheated = (cheat & 1) != 0;
                }
                // The game skips items whose hash is 0.
                if (it.PrefabHash != 0) inv.Items.Add(it);
            }
        }
        else
        {
            int n = r.Int();
            for (int i = 0; i < n; i++)
            {
                var it = new InventoryItem
                {
                    Name = r.String(),
                    Stack = r.Int(),
                    Durability = r.Float(),
                    GridX = r.Int(),
                    GridY = r.Int(),
                    Equipped = r.Bool(),
                };
                if (v >= IQuality) it.Quality = r.Int();
                if (v >= IVariant) it.Variant = r.Int();
                if (v >= ICrafterID)
                {
                    it.CrafterId = r.Long();
                    it.CrafterName = r.String();
                }
                if (v >= ICustomData) it.CustomData = r.StringStringMap();
                if (v >= IWorldLevel) it.WorldLevel = r.Int();
                if (v >= IPickedUp) it.PickedUp = r.Bool();
                if (v == IAbandonedDN || v >= IChunksNCheats) it.Cheated = r.Bool();
                if (it.Name != "") inv.Items.Add(it);
            }
        }
        return inv;
    }
}
