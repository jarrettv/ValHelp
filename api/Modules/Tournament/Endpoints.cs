namespace ValHelpApi.Modules.Tournament;

public static class Endpoints
{
  public static void MapTournamentEndpoints(this WebApplication app)
  {
    app.MapHuntEndpoints();
    app.MapModEndpoints();
  }
}