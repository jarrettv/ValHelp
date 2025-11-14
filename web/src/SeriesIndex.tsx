import "./Series.css";
import { Link } from "react-router";
import SeasonCard from "./components/SeasonCard";
import { useSeasons } from "./hooks/useSeries";
import { useAuth } from "./contexts/AuthContext";

export default function SeriesIndex() {
  const { data, isError, isPending, error } = useSeasons();
  const { status } = useAuth();

  if (isPending) {
    return <section className="loading">Loading series...</section>;
  }

  if (isError) {
    return <section className="alert error">Failed to load series: {error instanceof Error ? error.message : "Unknown error"}</section>;
  }

  return (
    <section id="series-page">
      <div className="series-heading">
        <div>
          <h2>Series</h2>
          <p>Seasons make it easy to plan recurring events and share the journey.</p>
        </div>
        {status?.isActive && (
          <Link className="series-cta" to="/series/new">Create Season</Link>
        )}
      </div>

      <section className="season-section">
        <header>
          <h3>Active Seasons</h3>
          <span>{data?.active.length ?? 0} running</span>
        </header>
        <div className="season-grid">
          {data && data.active.length > 0 ? (
            data.active.map(season => (
              <SeasonCard key={season.code} season={season} canManage={status?.isActive} />
            ))
          ) : (
            <div className="season-empty">No active seasons yet</div>
          )}
        </div>
      </section>

      {data && data.archived.length > 0 && (
        <section className="season-section archived">
          <header>
            <h3>Archived Seasons</h3>
            <span>{data.archived.length} completed</span>
          </header>
          <div className="season-grid">
            {data.archived.map(season => (
              <SeasonCard key={season.code} season={season} canManage={status?.isActive} />
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
