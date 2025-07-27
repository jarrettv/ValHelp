import { useMemo, useState } from "react";
import Trophy from "./components/Trophy";
import { useEvents } from "./hooks/useEvents";
import { EventStatus } from "./domain/event";
import "./PlayerLeaderboard.css";

// Table columns: Trophy+Event Name | Date | Hours | Placement | Player avatar+name | Score
const columns = [
  { key: "placement", label: "Place" },
  { key: "player", label: "Player" },
  { key: "score", label: "Score" },
  { key: "event", label: "Event" },
  { key: "date", label: "Date" },
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
    { label: "Hunt 4h", value: "Hunt 4h", trophyProps: {} },
    { label: "Rush", value: "Rush", trophyProps: { mode: "Rush" } },
    { label: "Saga", value: "Saga", trophyProps: { mode: "Saga" } },
    { label: "Hunt 5h", value: "Hunt 5h", trophyProps: {} },
  ];

  const selectType = (type: string) => {
    setSelectedType(type);
  };

  const rows = useMemo(() => {
    if (!data?.data) return [];
    let allRows: any[] = [];
    data.data.forEach(event => {
      if (event.status < EventStatus.Over) return;
      // Map selectedType to mode/hours
      let match = false;
      if (selectedType === "Rush" && event.mode === "TrophyRush") match = true;
      else if (selectedType === "Saga" && event.mode === "TrophySaga") match = true;
      else if (selectedType === "Hunt 4h" && event.mode === "TrophyHunt" && Math.round(event.hours) === 4) match = true;
      else if (selectedType === "Hunt 5h" && event.mode === "TrophyHunt" && Math.round(event.hours) === 5) match = true;
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
    return allRows.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "date") cmp = b.date - a.date;
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
      <h2>Player Leaderboard</h2>
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
              <th key={col.key} onClick={() => {
                if (sortBy === col.key) setSortDir(sortDir === "desc" ? "asc" : "desc");
                else { setSortBy(col.key); setSortDir("desc"); }
              }} style={{ cursor: "pointer" }}>
                {col.label} {sortBy === col.key ? (sortDir === "desc" ? "↓" : "↑") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td>
                {row.placement}
                <sup style={{ fontSize: '0.85em', marginLeft: 1 }}>{getPlaceSuffix(row.placement)}</sup>
              </td>
              <td>
                <img src={row.player.avatarUrl} alt={row.player.name} style={{ width: 22, height: 22, borderRadius: "50%", marginRight: 6, verticalAlign: "middle" }} />
                {row.player.name}
              </td>
              <td className="score-cell">{row.score}</td>
              <td>
                <Trophy style={{ width: 22, height: 22, verticalAlign: "middle", marginRight: 6, marginTop: -4 }} />
                {row.event.name} <small>{row.hours}h</small>
              </td>
              <td>{row.date.toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default PlayerLeaderboard;
