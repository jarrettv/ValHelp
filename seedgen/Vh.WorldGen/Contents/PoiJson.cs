using System.Text.Json.Serialization;

namespace Vh.World;

/// <summary>
/// POIs as JSON without reflection (source-generated), for the WebAssembly
/// build, where trimming removes what reflection-based serialization needs.
/// Same shape as seedgen's `pois` file (camelCase, nulls included).
/// </summary>
[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(List<PoiLocation>))]
public partial class PoiJson : JsonSerializerContext;
