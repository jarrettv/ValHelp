using System.Text.Json;
using Vh.Character;

namespace ValHelpApi.ModuleCharacters;

/// <summary>The JSON kept per snapshot: the whole profile except the fog bitmaps (those are tiles).</summary>
public static class CharSnapshotJson
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public record SnapshotData(
        int Version, string Name, long PlayerId, string StartSeed, bool UsedCheats, DateTimeOffset? Created,
        bool FirstSpawn, Dictionary<int, StatsData> Stats, List<WorldData> Worlds, PlayerOut? Player);

    public record StatsData(
        Dictionary<string, float> Values, Dictionary<string, float> KnownWorlds, Dictionary<string, float> KnownWorldKeys,
        Dictionary<string, float> KnownCommands, List<Dictionary<string, float>> Enemies, Dictionary<string, float> Pickups,
        Dictionary<string, float> Crafts, Dictionary<string, float> Pickables, Dictionary<string, float> FoodEaten,
        Dictionary<string, float> PiecesPlaced);

    public record WorldData(
        long Uid, Vec3? Spawn, Vec3? Logout, Vec3? Death, Vec3 Home, int Explored, int ExploredOthers,
        bool? PublicPosition, List<MapPin> Pins);

    /// <summary>PlayerData without the opaque build-menu bytes.</summary>
    public record PlayerOut(
        int Version, float MaxHealth, float Health, float MaxStamina, float Stamina, float MaxEitr, float Eitr,
        float TimeSinceDeath, string GuardianPower, float GuardianPowerCooldown, Inventory Inventory,
        List<string> KnownRecipes, Dictionary<string, int> KnownStations, List<string> KnownMaterials,
        List<string> ShownTutorials, List<string> Uniques, List<string> Trophies, List<string> KnownBiomes,
        Dictionary<string, string> KnownTexts, string Beard, string Hair, Vec3 SkinColor, Vec3 HairColor, int Model,
        List<Food> Foods, List<Skill> Skills, Dictionary<string, string> CustomData,
        Dictionary<int, int> DropCounters, Dictionary<int, int> UpgradeSeeds);

    public static string ToJson(CharacterProfile p)
    {
        // Slot 0 is the total; the game also adds to the current difficulty's
        // slot, which then mirrors slot 0. Keep other slots only when they differ.
        var stats = new Dictionary<int, StatsData>();
        string? slot0 = null;
        for (int i = 0; i < p.Stats.Count; i++)
        {
            var s = StatsOut(p.Stats[i]);
            var json = JsonSerializer.Serialize(s, Json);
            if (i == 0) slot0 = json;
            else if (json == slot0 || IsEmptyStats(s)) continue;
            stats[i] = s;
        }

        var worlds = p.Worlds.Select(w => new WorldData(
            w.WorldUid, w.CustomSpawn, w.Logout, w.Death, w.Home,
            w.Map?.ExploredCount ?? 0, w.Map?.ExploredOthersCount ?? 0, w.Map?.PublicPosition,
            w.Map?.Pins ?? [])).ToList();

        var d = p.Player;
        var player = d == null ? null : new PlayerOut(
            d.Version, d.MaxHealth, d.Health, d.MaxStamina, d.Stamina, d.MaxEitr, d.Eitr, d.TimeSinceDeath,
            d.GuardianPower, d.GuardianPowerCooldown, d.Inventory, d.KnownRecipes, d.KnownStations,
            d.KnownMaterials, d.ShownTutorials, d.Uniques, d.Trophies, d.KnownBiomes, d.KnownTexts, d.Beard, d.Hair,
            d.SkinColor, d.HairColor, d.Model, d.Foods, d.Skills, d.CustomData, d.DropCounters, d.UpgradeSeeds);

        return JsonSerializer.Serialize(new SnapshotData(p.Version, p.Name, p.PlayerId, p.StartSeed, p.UsedCheats,
            p.Created, p.FirstSpawn, stats, worlds, player), Json);
    }

    static StatsData StatsOut(PlayerStats s)
    {
        var values = new Dictionary<string, float>();
        for (int i = 0; i < s.Values.Length; i++)
            if (s.Values[i] != 0) values[GameNames.PlayerStat(i)] = s.Values[i];
        return new StatsData(values, s.KnownWorlds, s.KnownWorldKeys, s.KnownCommands,
            s.EnemyStats.Select(e => NonZero(e)).ToList(), s.ItemPickups, s.ItemCrafts, s.Pickables, s.FoodEaten,
            s.PiecesPlaced);
    }

    static Dictionary<string, float> NonZero(Dictionary<string, float> d) =>
        d.Where(kv => kv.Value != 0).ToDictionary();

    static bool IsEmptyStats(StatsData s) =>
        s.Values.Count == 0 && s.KnownWorlds.Count == 0 && s.KnownWorldKeys.Count == 0 && s.KnownCommands.Count == 0
        && s.Enemies.All(e => e.Count == 0) && s.Pickups.Count == 0 && s.Crafts.Count == 0 && s.Pickables.Count == 0
        && s.FoodEaten.Count == 0 && s.PiecesPlaced.Count == 0;
}
