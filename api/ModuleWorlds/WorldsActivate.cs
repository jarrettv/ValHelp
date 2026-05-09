namespace ValHelpApi.ModuleWorlds;

public static class WorldsActivate
{
    public static void MapEndpointsWorlds(this WebApplication app)
    {
        WorldsEndpoints.Map(app);
    }
}
