using Microsoft.EntityFrameworkCore;

namespace ValHelpApi.ModuleCharacters;

public static class CharActivate
{
    public static void MapEndpointsCharacters(this WebApplication app)
    {
        CharDevices.Map(app);
        CharUpload.Map(app);
        CharEndpoints.Map(app);
    }

    public static void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<CharDevice>().ToTable("char_devices");
        modelBuilder.Entity<CharDeviceLink>().ToTable("char_device_links").HasKey(l => l.DeviceCode);
        modelBuilder.Entity<CharWorld>().ToTable("char_worlds");
        modelBuilder.Entity<Character>().ToTable("characters");
        modelBuilder.Entity<CharSnapshot>().ToTable("char_snapshots");
        modelBuilder.Entity<CharSnapshot>().Property(s => s.Data).HasColumnType("jsonb");
        modelBuilder.Entity<CharMapTile>().ToTable("char_map_tiles")
            .HasKey(t => new { t.SnapshotId, t.WorldId, t.Tile });
    }
}
