namespace ValHelpApi.ModuleCharacters;

// Tables: Migrations/CharacterTracking.sql.

public class CharDevice
{
    public long Id { get; set; }
    public int UserId { get; set; }
    public string Name { get; set; } = "";
    /// <summary>SHA-256 (hex) of the bearer token the watcher sends.</summary>
    public string TokenHash { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public DateTime LastSeenAt { get; set; }
    public DateTime? RevokedAt { get; set; }
}

public class CharDeviceLink
{
    public string DeviceCode { get; set; } = "";
    public string UserCode { get; set; } = "";
    public string DeviceName { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public int? UserId { get; set; }
    public DateTime? ApprovedAt { get; set; }
    public DateTime? ClaimedAt { get; set; }
}

public class CharWorld
{
    public long Id { get; set; }
    /// <summary>The game's world UID (World.m_uid), as stored in the .fch.</summary>
    public long Uid { get; set; }
    /// <summary>World name (local save name or the server's world name), when known.</summary>
    public string? Name { get; set; }
    public string? Seed { get; set; }
    /// <summary>StableHash of the seed, known before the seed itself for server worlds (cacheMinimapMeta).</summary>
    public int? SeedHash { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? SeedgenAt { get; set; }
    public int? SeedgenBy { get; set; }
}

public class Character
{
    public long Id { get; set; }
    public int UserId { get; set; }
    /// <summary>The game's player id (PlayerProfile.m_playerID).</summary>
    public long PlayerId { get; set; }
    public string Name { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public string LatestHash { get; set; } = "";
    public DateTime LatestFileTime { get; set; }
    /// <summary>Gzipped .fch of the newest snapshot.</summary>
    public byte[] LatestRaw { get; set; } = [];
}

public class CharSnapshot
{
    public long Id { get; set; }
    public long CharacterId { get; set; }
    /// <summary>When the game wrote the save (the file's mtime on the player's machine).</summary>
    public DateTime FileTime { get; set; }
    public DateTime UploadedAt { get; set; }
    public string Hash { get; set; } = "";
    /// <summary>1-based play session; a new one starts after more than an hour between saves.</summary>
    public int Session { get; set; }
    /// <summary>The game's active play clock (TimeInBase + TimeOutOfBase).</summary>
    public float PlaySeconds { get; set; }
    /// <summary>Position on the play-time axis: play clock gains only, so it never goes back.</summary>
    public float AxisSeconds { get; set; }
    /// <summary>The play clock went backwards: a backup was restored.</summary>
    public bool Rewind { get; set; }
    /// <summary>The world played since the previous snapshot, when it can be told.</summary>
    public long? WorldId { get; set; }
    /// <summary>Parsed profile without the fog bitmaps (CharSnapshotData as JSON).</summary>
    public string Data { get; set; } = "{}";
}

public class CharMapTile
{
    public long SnapshotId { get; set; }
    public long WorldId { get; set; }
    /// <summary>ty * 32 + tx.</summary>
    public short Tile { get; set; }
    /// <summary>64 rows of 64 bits (8 bytes per row, LSB = leftmost cell).</summary>
    public byte[] Explored { get; set; } = [];
    public byte[]? Others { get; set; }
}
