
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using ValHelpApi.Config;

namespace ValHelpApi.ModuleAdmin;

public static class AdminActivate
{
    public static void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>()
          .HasIndex(u => u.DiscordId)
          .IsUnique();

        modelBuilder.Entity<Avatar>()
          .HasKey(a => a.Hash);

        modelBuilder.Entity<Scoring>()
        .HasKey(h => h.Code);

        modelBuilder.Entity<Scoring>()
        .Property(h => h.Scores)
        .HasColumnType("jsonb")
                .HasConversion(AppDbContext.CreateDictionaryConverter<int>(), new ValueComparer<Dictionary<string, int>>(
                    (c1, c2) => c1!.SequenceEqual(c2!),
                    c => c.Aggregate(0, (a, v) => HashCode.Combine(a, v.Key.GetHashCode(), v.Value.GetHashCode())),
                    c => c.ToDictionary(kv => kv.Key, kv => kv.Value)));

        modelBuilder.Entity<Scoring>()
        .Property(h => h.Rates)
        .HasColumnType("jsonb")
                .HasConversion(AppDbContext.CreateDictionaryConverter<float>(), new ValueComparer<Dictionary<string, float>>(
                    (c1, c2) => c1!.SequenceEqual(c2!),
                    c => c.Aggregate(0, (a, v) => HashCode.Combine(a, v.Key.GetHashCode(), v.Value.GetHashCode())),
                    c => c.ToDictionary(kv => kv.Key, kv => kv.Value)));
    }
}
