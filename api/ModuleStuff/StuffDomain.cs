namespace ValHelpApi.ModuleStuff;

public class Item
{
    public string Code { get; set; } = null!;
    public string Name { get; set; } = null!;
    public string Biome { get; set; } = null!;
    public string Group { get; set; } = null!;
    public string Type { get; set; } = null!;
    public string Usage { get; set; } = null!;
    public float Weight { get; set; }
    public int Stack { get; set; }
    public int Tier { get; set; } // check Henrik and others for this
    public string ImageUrl { get; set; } = null!;
    public object Info { get; set; } = null!;
    public int Order { get; set; }
    public bool IsActive { get; set; } = true;
}
