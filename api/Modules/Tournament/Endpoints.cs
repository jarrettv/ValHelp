namespace ValHelpApi.Modules.Tournament;

public static class Endpoints
{
  public static void MapTournamentEndpoints(this WebApplication app)
  {
    app.MapEventEndpoints();
    app.MapModEndpoints();
    app.MapScoringEndpoints();
    app.MapImportEndpoints();
    app.MapPlayerEndpoints();
  }
}