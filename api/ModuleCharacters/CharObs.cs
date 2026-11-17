using System.Text.Json;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using ValHelpApi.Config;
using Vh.Character;

namespace ValHelpApi.ModuleCharacters;

/// <summary>
///   GET api/obs/run/{code}   anyone with the OBS secret code — boss progress of the
///                            owner's most recently saved tracked character
///
/// Everything comes from the latest save (.fch), so it moves when the game saves
/// (autosave or logout), not live:
///   found     a Vegvisir pin for the boss in the world the save was made in
///             (or the boss is already dead)
///   gather    summon items: PlayerStats item pickups (by stack, first pickup only) or
///             the count in the inventory now, whichever is more
///   craft     PlayerStats item crafts (Sealbreaker, Bells)
///   ready     Kall only: three Malicious Blood in the inventory
///   defeated  PlayerStats enemy kills (the player's own kills)
/// A later stage done marks the earlier ones done too. An admin can push a run
/// ahead of its last save (CharObsAdmin, <see cref="ObsOverride"/>).
/// </summary>
public static class CharObs
{
    internal static void Map(WebApplication app)
    {
        app.MapGet("api/obs/run/{code}", Run);
        app.MapGet("api/char/{id:long}/snapshots/{sid:long}/bosses", AtSave);
    }

    /// <summary>
    /// The run page's boss tracker: boss progress at one save (characters are public). Pins are
    /// read from ?world= (the world on screen), else the save's own world. The newest save also
    /// carries the admin's manual progress, as the OBS overlay does.
    /// </summary>
    public static async Task<Results<Ok<BossOut[]>, NotFound>> AtSave(long id, long sid, long? world, AppDbContext db,
        CancellationToken cancel)
    {
        var snap = await db.Set<CharSnapshot>().AsNoTracking()
            .Where(s => s.Id == sid && s.CharacterId == id)
            .Select(s => new { s.FileTime, s.WorldId, s.Data })
            .SingleOrDefaultAsync(cancel);
        if (snap == null) return TypedResults.NotFound();
        long? worldId = world ?? snap.WorldId;
        long? worldUid = worldId is { } wid
            ? await db.Set<CharWorld>().Where(w => w.Id == wid).Select(w => (long?)w.Uid).SingleOrDefaultAsync(cancel)
            : null;

        var states = Progress(snap.Data, worldUid);
        bool newest = !await db.Set<CharSnapshot>().AnyAsync(s => s.CharacterId == id && s.FileTime > snap.FileTime, cancel);
        if (newest)
        {
            var ovJson = await db.Set<CharObsOverride>().AsNoTracking()
                .Where(o => o.CharacterId == id).Select(o => o.Data).SingleOrDefaultAsync(cancel);
            if (ovJson != null && JsonSerializer.Deserialize<ObsOverride>(ovJson, CharSnapshotJson.Json) is { } ov)
                states = Apply(states, ov);
        }
        return TypedResults.Ok(Build(states));
    }

    /// <summary>Kind: gather | craft | ready. Item: prefab name (icon).</summary>
    public record StepOut(string Kind, string Label, string Item, int Have, int Need, bool Done);
    /// <summary>Phase: 1 pre-Moder, 2 pre-Fader, 3 invasions and the rest.</summary>
    public record BossOut(string Key, string Name, string Icon, int Phase, bool Found, bool Defeated, StepOut[] Steps);
    public record RunOut(long CharacterId, string Character, DateTime SavedAt, float PlaySeconds, BossOut[] Bosses);

    record Step(string Kind, string Label, string Item, string Token, int Need);
    /// <summary>Kills: the enemy names (Character.m_name) whose death counts.</summary>
    record Boss(string Key, string Name, string Icon, int Phase, string[] Kills, Step[] Steps);

    static readonly Boss[] Bosses =
    [
        new("eikthyr", "Eikthyr", "TrophyEikthyr", 1, ["$enemy_eikthyr"],
            [new("gather", "Deer Trophy", "TrophyDeer", "$item_trophy_deer", 2)]),
        new("gdking", "The Elder", "TrophyTheElder", 1, ["$enemy_gdking"],
            [new("gather", "Ancient Seed", "AncientSeed", "$item_ancientseed", 3)]),
        new("bonemass", "Bonemass", "TrophyBonemass", 1, ["$enemy_bonemass"],
            [new("gather", "Withered Bone", "WitheredBone", "$item_witheredbone", 10)]),
        new("dragon", "Moder", "TrophyDragonQueen", 1, ["$enemy_dragon"],
            [new("gather", "Dragon Egg", "DragonEgg", "$item_dragonegg", 3)]),
        new("goblinking", "Yagluth", "TrophyGoblinKing", 2, ["$enemy_goblinking"],
            [new("gather", "Fuling Totem", "GoblinTotem", "$item_goblintotem", 5)]),
        new("seekerqueen", "The Queen", "TrophySeekerQueen", 2, ["$enemy_seekerqueen"],
            [new("gather", "Sealbreaker Fragment", "DvergrKeyFragment", "$item_dvergrkeyfragment", 9),
             new("craft", "Sealbreaker", "DvergrKey", "$item_dvergrkey", 1)]),
        new("fader", "Fader", "TrophyFader", 2, ["$enemy_fader"],
            [new("gather", "Bell Fragment", "BellFragment", "$item_bellfragment", 9),
             new("craft", "Bell", "Bell", "$item_bell", 3)]),
        // Each Jotun invasion ends with its Black Ice Core breaking, which drops one Malicious Blood.
        new("frozenking", "Kall Fimbulbringer", "Bestiary_FrozenKing", 3, ["$enemy_frozenking", "$enemy_frozenking_p3"],
            [new("gather", "Jotun Invasion", "HatefulBlood", "$item_hatefulblood", 3),
             new("ready", "Malicious Blood", "HatefulBlood", "$item_hatefulblood", 3)]),
    ];

    public static async Task<Results<Ok<RunOut>, NotFound>> Run(string code, long? character, AppDbContext db,
        HttpContext ctx, CancellationToken cancel)
    {
        if (string.IsNullOrWhiteSpace(code) || code.Length < 8 || code == "CHANGEME") return TypedResults.NotFound();
        var userId = await db.Users.AsNoTracking().Where(u => u.ObsSecretCode == code).Select(u => u.Id)
            .FirstOrDefaultAsync(cancel);
        if (userId == 0) return TypedResults.NotFound();

        var c = await db.Set<Character>().AsNoTracking()
            .Where(c => c.UserId == userId && (character == null || c.Id == character))
            .OrderByDescending(c => c.LatestFileTime)
            .Select(c => new { c.Id, c.Name })
            .FirstOrDefaultAsync(cancel);
        if (c == null) return TypedResults.NotFound();
        var run = await Load(db, c.Id, c.Name, cancel);
        if (run == null) return TypedResults.NotFound();

        ctx.Response.Headers.CacheControl = "no-store";
        return TypedResults.Ok(run.Value.Effective);
    }

    /// <summary>
    /// A character's boss progress from its newest save (Auto) and with the admin's
    /// manual progress on top (Effective). Null when it has no save yet.
    /// </summary>
    internal static async Task<(RunOut Auto, RunOut Effective, ObsOverride Override)?> Load(
        AppDbContext db, long characterId, string name, CancellationToken cancel)
    {
        var snap = await db.Set<CharSnapshot>().AsNoTracking()
            .Where(s => s.CharacterId == characterId)
            .OrderByDescending(s => s.FileTime)
            .Select(s => new { s.FileTime, s.AxisSeconds, s.WorldId, s.Data })
            .FirstOrDefaultAsync(cancel);
        if (snap == null) return null;
        long? worldUid = snap.WorldId is { } wid
            ? await db.Set<CharWorld>().Where(w => w.Id == wid).Select(w => (long?)w.Uid).SingleOrDefaultAsync(cancel)
            : null;
        var ovJson = await db.Set<CharObsOverride>().AsNoTracking()
            .Where(o => o.CharacterId == characterId).Select(o => o.Data).SingleOrDefaultAsync(cancel);
        var ov = ovJson == null ? new ObsOverride([])
            : JsonSerializer.Deserialize<ObsOverride>(ovJson, CharSnapshotJson.Json) ?? new ObsOverride([]);

        var auto = Progress(snap.Data, worldUid);
        RunOut Out(BossState[] states) => new(characterId, name, snap.FileTime, snap.AxisSeconds, Build(states));
        return (Out(auto), Out(Apply(auto, ov)), ov);
    }

    /// <summary>What the save says about one boss, before the stages are worked out.</summary>
    internal record BossState(string Key, bool Found, bool Defeated, int[] Have);

    /// <summary>
    /// Manual progress for a run (char_obs_overrides.data), per boss key. Each value is a
    /// floor over the save: it can put a boss ahead of the last save, and later saves only
    /// move it further. Steps: one count per summon step, null to leave it to the save.
    /// </summary>
    public record ObsOverride(Dictionary<string, BossOverride> Bosses);
    public record BossOverride(bool? Found, bool? Defeated, int?[]? Steps);

    internal static BossState[] Apply(BossState[] auto, ObsOverride ov) => auto.Select(a =>
    {
        if (!ov.Bosses.TryGetValue(a.Key, out var o)) return a;
        var have = a.Have.Select((h, i) => o.Steps is { } s && i < s.Length && s[i] is { } m ? Math.Max(h, m) : h).ToArray();
        return new BossState(a.Key, a.Found || o.Found == true, a.Defeated || o.Defeated == true, have);
    }).ToArray();

    internal static bool IsBoss(string key) => Bosses.Any(b => b.Key == key);
    internal static int StepCount(string key) => Bosses.Single(b => b.Key == key).Steps.Length;

    /// <summary>The overlay's view: a later stage done marks the earlier ones done; dead bosses count as found.</summary>
    internal static BossOut[] Build(BossState[] states) => states.Select(st =>
    {
        var b = Bosses.Single(x => x.Key == st.Key);
        var done = new bool[b.Steps.Length];
        bool later = st.Defeated;
        for (int i = b.Steps.Length - 1; i >= 0; i--)
            later = done[i] = later || st.Have[i] >= b.Steps[i].Need;
        var steps = b.Steps.Select((s, i) => new StepOut(s.Kind, s.Label, s.Item,
            done[i] ? s.Need : Math.Min(st.Have[i], s.Need), s.Need, done[i])).ToArray();
        return new BossOut(b.Key, b.Name, b.Icon, b.Phase, st.Found || st.Defeated, st.Defeated, steps);
    }).ToArray();

    /// <summary>Boss state from a snapshot's JSON (CharSnapshotJson); worldUid: the world played, else the most explored.</summary>
    internal static BossState[] Progress(string data, long? worldUid)
    {
        using var doc = JsonDocument.Parse(data);
        var root = doc.RootElement;

        // Stats slot 0 is the running total; its enemy bucket 0 counts every kill.
        var kills = new Dictionary<string, float>();
        var pickups = new Dictionary<string, float>();
        var crafts = new Dictionary<string, float>();
        if (root.TryGetProperty("stats", out var stats) && stats.TryGetProperty("0", out var s0))
        {
            if (s0.TryGetProperty("enemies", out var en) && en.GetArrayLength() > 0) kills = Floats(en[0]);
            if (s0.TryGetProperty("pickups", out var pk)) pickups = Floats(pk);
            if (s0.TryGetProperty("crafts", out var cr)) crafts = Floats(cr);
        }

        // Vegvisir pins name the boss ("$enemy_dragon", "$enemy_fader_codename").
        var pins = new List<string>();
        JsonElement? world = null;
        foreach (var w in root.GetProperty("worlds").EnumerateArray())
        {
            if (worldUid != null) { if (w.GetProperty("uid").GetInt64() == worldUid) { world = w; break; } }
            else if (world == null || w.GetProperty("explored").GetInt32() > world.Value.GetProperty("explored").GetInt32()) world = w;
        }
        if (world is { } wd && wd.TryGetProperty("pins", out var pinsEl))
            foreach (var p in pinsEl.EnumerateArray())
                if (p.TryGetProperty("name", out var n) && n.GetString() is { Length: > 0 } name) pins.Add(name);

        // Inventory: 1.0 saves hold only the prefab's StableHash; older ones the prefab name.
        var held = new Dictionary<string, int>();
        if (root.TryGetProperty("player", out var pl) && pl.ValueKind == JsonValueKind.Object)
            foreach (var i in pl.GetProperty("inventory").GetProperty("items").EnumerateArray())
            {
                var stack = i.GetProperty("stack").GetInt32();
                var name = i.TryGetProperty("name", out var nm) && nm.ValueKind == JsonValueKind.String ? nm.GetString() : null;
                var key = name is { Length: > 0 } ? name : $"#{i.GetProperty("prefabHash").GetInt32()}";
                held[key] = held.GetValueOrDefault(key) + stack;
            }
        int Held(string prefab) => held.GetValueOrDefault(prefab) + held.GetValueOrDefault($"#{WorldFile.StableHash(prefab)}");

        return Bosses.Select(b =>
        {
            bool defeated = b.Kills.Any(k => kills.GetValueOrDefault(k) > 0);
            var have = b.Steps.Select(s => s.Kind switch
            {
                "craft" => (int)crafts.GetValueOrDefault(s.Token),
                "ready" => Held(s.Item),
                _ => Math.Max((int)pickups.GetValueOrDefault(s.Token), Held(s.Item)),
            }).ToArray();
            bool found = pins.Any(p => p == "$enemy_" + b.Key || p.StartsWith("$enemy_" + b.Key + "_"));
            return new BossState(b.Key, found, defeated, have);
        }).ToArray();
    }

    static Dictionary<string, float> Floats(JsonElement e)
    {
        var d = new Dictionary<string, float>();
        if (e.ValueKind == JsonValueKind.Object)
            foreach (var p in e.EnumerateObject())
                if (p.Value.ValueKind == JsonValueKind.Number) d[p.Name] = p.Value.GetSingle();
        return d;
    }
}
