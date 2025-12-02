import { useMemo, useState } from "react";
import Trophy from "./components/Trophy";
import { useEvents, EventRow, EventRowPlayer } from "./hooks/useEvents";
import { EventStatus } from "./domain/event";
import "./PlayerLeaderboard.css";

// Table columns: Trophy+Event Name | Date | Hours | Placement | Player avatar+name | Score
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

// Event type options now use backend mode/hours

function PlayerLeaderboard() {
  const { data, isError, isPending } = useEvents();
  const [sortBy, setSortBy] = useState("score");
  const [sortDir, setSortDir] = useState("desc");
  const [selectedType, setSelectedType] = useState<string>("Hunt 4h");

  const EVENT_TYPE_OPTIONS = [
    { label: "Hunt 4h", value: "Hunt 4h", trophyProps: { mode: "TrophyHunt", hours: 4 } },
    { label: "Rush", value: "Rush 4h", trophyProps: { mode: "TrophyRush", hours: 4 } },
    { label: "Saga", value: "Saga 4h", trophyProps: { mode: "TrophySaga", hours: 4 } },
    { label: "Hunt 5h", value: "Hunt 5h", trophyProps: { mode: "TrophyHunt", hours: 5 } },
    { label: "Trailblazer", value: "Trailblazer 3h", trophyProps: { mode: "TrophyTrailblazer", hours: 3 } },
  ];

  const selectType = (type: string) => {
    setSelectedType(type);
  };

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

      var selected = EVENT_TYPE_OPTIONS.find(t => t.value === selectedType);
      let match = false;
      if (selected && event.mode === selected.trophyProps.mode && Math.round(event.hours) === selected.trophyProps.hours) {
        match = true;
      }
      if (!match) return;
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
  }, [data, sortBy, sortDir, selectedType]);

  if (isPending) return <div>Loading...</div>;
  if (isError) return <div>Problem loading events</div>;

  return (
    <div className="leaderboard-table-container">
      <h2>PB Leaderboard</h2>
      <div className="event-type-toggle-group" style={{ marginBottom: '1.2rem' }}>
        {EVENT_TYPE_OPTIONS.map((t) => (
          <button
            key={t.value}
            type="button"
            className={
              "event-type-toggle" + (selectedType === t.value ? " selected" : "")
            }
            onClick={() => selectType(t.value)}
            title={t.label}
            style={{ minWidth: 90, padding: '0.5rem 1rem' }}
          >
            <Trophy {...t.trophyProps} style={{ width: 22, height: 22, marginRight: 4, verticalAlign: 'middle', marginTop: -2 }} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>
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
    </div>
  );
}

export default PlayerLeaderboard;
