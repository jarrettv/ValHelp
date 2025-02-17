using CsvHelper;
using CsvHelper.Configuration;
using CsvHelper.TypeConversion;
using System.Globalization;
using System.Text.Json;
using ValHelpApi.Modules.Tournament;
using static ValHelpApi.Modules.Admin.DbEndpoints;

namespace ValHelpApi.Modules.Admin;

public static class CsvHelper
{
    public static async Task<List<T>> ReadFile<T>(string fileName, ClassMap<T> classMap) where T : class
    {
        var filePath = Path.Combine(Directory.GetCurrentDirectory(), "..\\..\\valhelp-data", $"{fileName}.csv");
        using (var reader = new StreamReader(filePath))
        using (var csv = new CsvReader(reader, CultureInfo.InvariantCulture))
        {
            csv.Context.RegisterClassMap(classMap);
            var records = csv.GetRecords<T>().ToList();
            return await Task.FromResult(records);
        }
    }

    public static List<T> ParseCsv<T>(string csvData, ClassMap<T> classMap) where T : class
    {
        using (var reader = new StringReader(csvData))
        using (var csv = new CsvReader(reader, CultureInfo.InvariantCulture))
        {
            csv.Context.RegisterClassMap(classMap);
            var records = csv.GetRecords<T>().ToList();
            return records;
        }
    }

}
public class UtcDateTimeConverter : DefaultTypeConverter
{
    public override object ConvertFromString(string? text, IReaderRow row, MemberMapData memberMapData)
    {
        if (DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var date))
        {
            return date;
        }
        return base.ConvertFromString(text, row, memberMapData)!;
    }
}
public class StringArrayConverter : DefaultTypeConverter
{
    public override object ConvertFromString(string? text, IReaderRow row, MemberMapData memberMapData)
    {
        return JsonSerializer.Deserialize<string[]>(text ?? "")!;
    }
}

public class CsvConverter : DefaultTypeConverter
{
    public override object ConvertFromString(string? text, IReaderRow row, MemberMapData memberMapData)
    {
        return (text ?? "").Split(',').Select(x => x.Trim()).ToArray();
    }
}

public class DictionaryStringIntConverter : DefaultTypeConverter
{
    public override object ConvertFromString(string? text, IReaderRow row, MemberMapData memberMapData)
    {
        return JsonSerializer.Deserialize<Dictionary<string, int>>(text ?? "")!;
    }
}
public class DictionaryStringStringConverter : DefaultTypeConverter
{
    public override object ConvertFromString(string? text, IReaderRow row, MemberMapData memberMapData)
    {
        return JsonSerializer.Deserialize<Dictionary<string, string>>(text ?? "")!;
    }
}

public class PlayerLogListConverter : DefaultTypeConverter
{
    public override object ConvertFromString(string? text, IReaderRow row, MemberMapData memberMapData)
    {
        return JsonSerializer.Deserialize<List<PlayerLog>>(text ?? "")!;
    }
}

public class TrackerLogListConverter : DefaultTypeConverter
{
    public override object ConvertFromString(string? text, IReaderRow row, MemberMapData memberMapData)
    {
        return JsonSerializer.Deserialize<List<TrackerLog>>(text ?? "")!;
    }
}

public class UserMap : ClassMap<User>
{
    public UserMap()
    {
        Map(m => m.Id).Name("id");
        Map(m => m.Username).Name("username");
        Map(m => m.Email).Name("email");
        Map(m => m.DiscordId).Name("discord_id");
        Map(m => m.CreatedAt).Name("created_at").TypeConverter<UtcDateTimeConverter>();
        Map(m => m.UpdatedAt).Name("updated_at").TypeConverter<UtcDateTimeConverter>();
        Map(m => m.LastLoginAt).Name("last_login_at").TypeConverter<UtcDateTimeConverter>();
        Map(m => m.Roles).Name("roles").TypeConverter<StringArrayConverter>();
        Map(m => m.AvatarUrl).Name("avatar_url");
        Map(m => m.Youtube).Name("youtube");
        Map(m => m.Twitch).Name("twitch");
        Map(m => m.IsActive).Name("is_active");
        Map(m => m.SteamId).Name("steam_id");
        Map(m => m.AltName).Name("alt_name");
    }
}
public class ScoringMap : ClassMap<Scoring>
{
    public ScoringMap()
    {
        Map(m => m.Code).Name("code");
        Map(m => m.Name).Name("name");
        Map(m => m.Scores).Name("scores").TypeConverter<DictionaryStringIntConverter>();
        Map(m => m.Modes).Name("modes").TypeConverter<StringArrayConverter>();
        Map(m => m.IsActive).Name("is_active");
    }
}

public class EventMap : ClassMap<Event>
{
    public EventMap()
    {
        Map(m => m.Id).Name("id");
        Map(m => m.Name).Name("name");
        Map(m => m.StartAt).Name("start_at").TypeConverter<UtcDateTimeConverter>();
        Map(m => m.EndAt).Name("end_at").TypeConverter<UtcDateTimeConverter>();
        Map(m => m.Status).Name("status");
        Map(m => m.Mode).Name("mode");
        Map(m => m.ScoringCode).Name("scoring_code");
        Map(m => m.Hours).Name("hours");
        Map(m => m.Desc).Name("desc");
        Map(m => m.Seed).Name("seed");
        Map(m => m.Prizes).Name("prizes").TypeConverter<DictionaryStringStringConverter>();
        Map(m => m.CreatedAt).Name("created_at").TypeConverter<UtcDateTimeConverter>();
        Map(m => m.CreatedBy).Name("created_by");
        Map(m => m.UpdatedAt).Name("updated_at").TypeConverter<UtcDateTimeConverter>();
        Map(m => m.UpdatedBy).Name("updated_by");
    }
}

public class PlayerMap : ClassMap<Player>
{
    public PlayerMap()
    {
        Map(m => m.EventId).Name("event_id");
        Map(m => m.UserId).Name("user_id");
        Map(m => m.Name).Name("name");
        Map(m => m.AvatarUrl).Name("avatar_url");
        Map(m => m.Stream).Name("stream");
        Map(m => m.Status).Name("status");
        Map(m => m.Score).Name("score");
        Map(m => m.UpdatedAt).Name("updated_at").TypeConverter<UtcDateTimeConverter>();
        Map(m => m.Logs).Name("logs").TypeConverter<PlayerLogListConverter>();
    }
}

public class TrackLogMap : ClassMap<TrackLog>
{
    public TrackLogMap()
    {
        Map(m => m.At).Name("at").TypeConverter<UtcDateTimeConverter>();
        Map(m => m.Id).Name("id");
        Map(m => m.User).Name("user");
        Map(m => m.Seed).Name("seed");
        Map(m => m.Mode).Name("mode");
        Map(m => m.Score).Name("score");
        Map(m => m.Logs).Name("logs").TypeConverter<TrackerLogListConverter>();
    }
}

public class TrackHuntMap : ClassMap<TrackHunt>
{
    public TrackHuntMap()
    {
        Map(m => m.Id).Name("id");
        Map(m => m.CreatedAt).Name("created_at").TypeConverter<UtcDateTimeConverter>();
        Map(m => m.CurrentScore).Name("current_score");
        Map(m => m.Deaths).Name("deaths");
        Map(m => m.Logouts).Name("logouts");
        Map(m => m.PlayerLocation).Name("player_location");
        Map(m => m.PlayerName).Name("player_name");
        Map(m => m.PlayerId).Name("player_id");
        Map(m => m.SessionId).Name("session_id");
        Map(m => m.Trophies).Name("trophies");
        Map(m => m.Gamemode).Name("gamemode");
    }
}

public class HuntMap : ClassMap<Hunt>
{
    public HuntMap()
    {
        Map(m => m.Id).Name("id");
        Map(m => m.Name).Name("name");
        Map(m => m.Desc).Name("desc");
        Map(m => m.Scoring).Name("scoring").TypeConverter<DictionaryStringIntConverter>();
        Map(m => m.StartAt).Name("start_at").TypeConverter<UtcDateTimeConverter>();
        Map(m => m.EndAt).Name("end_at").TypeConverter<UtcDateTimeConverter>();
        Map(m => m.Seed).Name("seed");
        Map(m => m.Prizes).Name("prizes").TypeConverter<DictionaryStringStringConverter>();
        Map(m => m.Status).Name("status");
        Map(m => m.CreatedAt).Name("created_at").TypeConverter<UtcDateTimeConverter>();
        Map(m => m.CreatedBy).Name("created_by");
        Map(m => m.UpdatedAt).Name("updated_at").TypeConverter<UtcDateTimeConverter>();
        Map(m => m.UpdatedBy).Name("updated_by");
    }
}

public class HuntsPlayerMap : ClassMap<HuntsPlayer>
{
    public HuntsPlayerMap()
    {
        Map(m => m.HuntId).Name("hunt_id");
        Map(m => m.PlayerId).Name("player_id");
        Map(m => m.Name).Name("name");
        Map(m => m.Stream).Name("stream");
        Map(m => m.Status).Name("status");
        Map(m => m.Score).Name("score");
        Map(m => m.Deaths).Name("deaths");
        Map(m => m.Relogs).Name("relogs");
        Map(m => m.Trophies).Name("trophies").TypeConverter<StringArrayConverter>();
        Map(m => m.UpdatedAt).Name("updated_at").TypeConverter<UtcDateTimeConverter>();
    }
}
public class UserAltsMap : ClassMap<UserAlts>
{
    public UserAltsMap()
    {
        Map(m => m.Username).Name("username");
        Map(m => m.DiscordId).Name("discord_id");
        Map(m => m.SteamId).Name("steam_id");
        Map(m => m.AltName).Name("alt_name");
    }
}