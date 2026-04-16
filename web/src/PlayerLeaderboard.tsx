import { useMemo, useState } from "react";
import { useParams } from "react-router";
import Trophy from "./components/Trophy";
import CategorySideNav from "./components/CategorySideNav";
import { findCategory } from "./components/eventCategories";
import { useEvents, EventRow, EventRowPlayer } from "./hooks/useEvents";
import { EventStatus } from "./domain/event";
import "./PlayerLeaderboard.css";
import "./components/CategoryLayout.css";

const columns = [
  { key: "placement", label: "Place", wide: true },
  { key: "player", label: "Player" },
  { key: "score", label: "Score" },
  { key: "event", label: "Event" },
  { key: "date", label: "Date", wide: true },
];

function getPlaceSuffix(place: number): string {
  if (place % 100 >= 11 && place % 100 <= 13) return 'th';
  switch (place % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

function PlayerLeaderboard() {
  const { category: categorySlug } = useParams<{ category?: string }>();
  const category = findCategory(categorySlug);
  const { data, isError, isPending } = useEvents();
  const [sortBy, setSortBy] = useState("score");
  const [sortDir, setSortDir] = useState("desc");

  type LeaderboardRow = {
    event: EventRow;
    date: Date;
    hours: number;
    placement: number;
    player: EventRowPlayer;
    score: number;
  };

  const rows = useMemo<LeaderboardRow[]>(() => {
    if (!data?.data) return [];
    const allRows: LeaderboardRow[] = [];
    data.data.forEach(event => {
      if (event.status < EventStatus.Over) return;
      if (event.mode !== category.mode || Math.round(event.hours) !== category.hours) return;
      const sortedPlayers = [...event.players].sort((a, b) => b.score - a.score);
      sortedPlayers.forEach((player, idx) => {
        allRows.push({
          event,
          date: new Date(event.startAt),
          hours: event.hours,
          placement: idx + 1,
          player,
          score: player.score,
        });
      });
    });
    const bestByPlayer = new Map<number, LeaderboardRow>();

    allRows.forEach((row) => {
      const existing = bestByPlayer.get(row.player.id);
      if (!existing) {
        bestByPlayer.set(row.player.id, row);
        return;
      }

      if (row.score > existing.score) {
        bestByPlayer.set(row.player.id, row);
        return;
      }

      if (row.score === existing.score) {
        const rowTime = row.date.getTime();
        const existingTime = existing.date.getTime();

        if (rowTime > existingTime) {
          bestByPlayer.set(row.player.id, row);
          return;
        }

        if (rowTime === existingTime && row.placement < existing.placement) {
          bestByPlayer.set(row.player.id, row);
        }
      }
    });

    const dedupedRows = Array.from(bestByPlayer.values());
    const filteredRows = dedupedRows.filter((row) => row.score > 200);

    return filteredRows.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "date") cmp = b.date.getTime() - a.date.getTime();
      else if (sortBy === "event") cmp = a.event.name.localeCompare(b.event.name);
      else if (sortBy === "hours") cmp = b.hours - a.hours;
      else if (sortBy === "placement") cmp = a.placement - b.placement;
      else if (sortBy === "player") cmp = a.player.name.localeCompare(b.player.name);
      else if (sortBy === "score") cmp = b.score - a.score;
      return sortDir === "desc" ? cmp : -cmp;
    });
  }, [data, sortBy, sortDir, category]);

  return (
    <div className="category-layout">
      <CategorySideNav basePath="/leaderboard" highlightDefault />
      <div className="content">
        <div className="leaderboard-table-container">
          <h2>PB Leaderboard <small style={{ fontSize: '1rem', opacity: 0.7 }}>{category.label}</small></h2>
          {isPending && <div>Loading...</div>}
          {isError && <div>Problem loading events</div>}
          {!isPending && !isError && (
            <table className="leaderboard-table">
              <thead>
                <tr>
                  {columns.map(col => (
                    <th key={col.key} className={col.wide ? "wide" : ""} onClick={() => {
                      if (sortBy === col.key) setSortDir(sortDir === "desc" ? "asc" : "desc");
                      else { setSortBy(col.key); setSortDir("desc"); }
                    }} style={{ cursor: "pointer" }}>
                      {col.label} {sortBy === col.key ? (sortDir === "desc" ? "↓" : "↑") : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.player.id}>
                    <td className="wide">
                      {row.placement}
                      <sup style={{ fontSize: '0.85em', marginLeft: 1 }}>{getPlaceSuffix(row.placement)}</sup>
                    </td>
                    <td>
                      <img src={row.player.avatarUrl} alt={row.player.name} style={{ width: 22, height: 22, borderRadius: "50%", marginRight: 6, verticalAlign: "middle" }} />
                      <a href={`/players/${row.player.id}`}>{row.player.name}</a>
                    </td>
                    <td className="score-cell">{row.score}</td>
                    <td>
                      <a style={{ display: 'flex', alignItems: 'center' }} href={`/events/${row.event.id}`}>
                        <Trophy style={{ width: 22, height: 22, verticalAlign: "middle", marginRight: 6, marginTop: -4 }} />
                        <span className="naming wide">{row.event.name} <small>{row.hours}h</small></span>
                        <span className="naming mobile">{row.event.name.replace('Trophy ', '').replace('Event ', '').replace('# ', '#').substring(0, 13)}</span>
                      </a>
                    </td>
                    <td className="wide">{row.date.toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default PlayerLeaderboard;
