import React, { useState, useMemo, useEffect } from 'react';
import { Link, useParams } from 'react-router'; // Use react-router-dom
import { useEvent } from './hooks/useEvent';
import Spinner from './components/Spinner';
import TimeAgo from './components/TimeAgo';
import { getFriendlyDateRange, getShortDateRange } from './utils/date';
import { EventStatus, PlayerLog } from './domain/event'; // Adjust path if needed
import { useAuth } from './contexts/AuthContext'; // Adjust path if needed
import { PlayerTrophy } from './components/PlayerTrophy';
import { PlayerPenalty } from './components/PlayerPenalty';
import Trophy from './components/Trophy';

// --- Helper to format time for display ---
const formatSliderTime = (date: Date): string => {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

// --- Component ---
export default function EventTimelineView() {
  const { id } = useParams<{ id: string }>();
  const numericEventId = parseInt(id!, 10);
  const { data: eventData, isPending, isError, error } = useEvent(numericEventId);
  const { status: authStatus } = useAuth();

  // State for the slider's current time value (as milliseconds timestamp)
  const [currentTime, setCurrentTime] = useState<number>(0);

  // Calculate start and end times for the slider once data is available
  const { startTime, endTime } = useMemo(() => {
    const start = eventData?.startAt ? new Date(eventData.startAt).getTime() : 0;
    const end = eventData?.endAt ? new Date(eventData.endAt).getTime() : 0;
    return { startTime: start, endTime: end };
  }, [eventData?.startAt, eventData?.endAt]);

  // Initialize currentTime to startTime when data loads or changes
  useEffect(() => {
    if (startTime > 0) {
      setCurrentTime(startTime);
    }
  }, [startTime]); // Depend only on startTime

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentTime(parseInt(e.target.value, 10));
  };

  // Function to filter player logs (trophies and penalties) based on the slider's current time
  const getFilteredLogs = (logs: PlayerLog[]): PlayerLog[] => {
    if (!logs) return [];
    return logs
      .filter(log =>
        (log.code.startsWith('Trophy') || log.code.startsWith('Penalty')) &&
        new Date(log.at).getTime() <= currentTime
      )
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()); // Sort by time collected/applied
  };

  if (isPending) {
    return <div><Spinner /></div>;
  }

  if (isError || !eventData) {
    return <div>Error loading event data: {(error as Error)?.message || 'Event not found'}</div>;
  }

  const currentSliderDate = new Date(currentTime);

  return (
    <div className={eventData.status === EventStatus.Live ? "competition live" : "competition"}>
      {/* --- Event Header (similar to Event.tsx) --- */}
      <div style={{ display: "flex", alignItems: 'center', marginBottom: '1rem' }}>
        <Trophy style={{ opacity: eventData.status === EventStatus.Draft ? 0.2 : 1, marginRight: '1rem' }} />
        <div className="competition-info" style={{ flexGrow: 1 }}>
          <h3 style={{ fontSize: "1.5rem", margin: 0 }}>{eventData.name} - Timeline</h3>
          <div className="timing wide">
            {getFriendlyDateRange(new Date(eventData.startAt), new Date(eventData.endAt))}
          </div>
          <div className="timing mobile">
            {getShortDateRange(new Date(eventData.startAt), new Date(eventData.endAt))}
          </div>
        </div>
        <div className="seed">
          <div style={{ opacity: 0.6 }}>Seed</div>
          <div style={{ marginTop: "-0.3rem" }}>{eventData.seed}</div>
        </div>
      </div>

      {/* --- Timeline Slider --- */}
      <div style={{ margin: '20px 0', padding: '15px', border: '1px solid #444', borderRadius: '8px', background: '#2a2a2a' }}>
        <label htmlFor="timeSlider" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
          Event Time: {formatSliderTime(currentSliderDate)} (<TimeAgo targetTime={currentSliderDate} /> ago)
        </label>
        <input
          type="range"
          id="timeSlider"
          min={startTime}
          max={endTime}
          value={currentTime}
          onChange={handleSliderChange}
          step={1000} // Step by 1 second
          style={{ width: '100%', cursor: 'pointer' }}
          disabled={startTime === 0 || endTime === 0 || startTime === endTime}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8em', color: '#aaa', marginTop: '5px' }}>
          <span>{startTime ? formatSliderTime(new Date(startTime)) : 'Start'}</span>
          <span>{endTime ? formatSliderTime(new Date(endTime)) : 'End'}</span>
        </div>
      </div>

      {/* --- Players List with Filtered Trophies/Penalties --- */}
      <div>
        <h4>Player Progress</h4>
        {eventData.players && eventData.players.length > 0 ? (
          eventData.players
            .sort((a, b) => b.score - a.score) // Keep sorted by score, or adjust as needed
            .map(player => {
              const filteredLogs = getFilteredLogs(player.logs);
              const playerStatusClass = authStatus?.id === player.userId ? "active" : "normal"; // Mimic active player highlight
              return (
                // Apply player-row class for consistency, though layout differs slightly
                <div key={player.userId} className={`player-row ${playerStatusClass}`} style={{ display: 'flex', alignItems: 'center', marginBottom: '5px', padding: '8px 0', borderBottom: '1px solid #333' }}>
                  {/* Mimic player-info structure */}
                  <div className="player-info" style={{ flexBasis: '250px', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                     <img src={player.avatarUrl} alt={player.name} className="player-avatar" /> {/* Use class from PlayerRow.css */}
                     <div className="player-name" style={{ flexGrow: 1 }}> {/* Use class from PlayerRow.css */}
                       <Link to={`/players/${player.userId}`}>{player.name}</Link>
                       {/* Optionally add stream link like in PlayerLogsRow */}
                     </div>
                     {/* Score display isn't dynamic with time here, maybe add later if needed */}
                     {/* <div className="player-score">{player.score}</div> */}
                  </div>

                  {/* Apply player-logs class for styling */}
                  <div className="player-logs" style={{ flexGrow: 1, marginLeft: '15px' }}>
                    {filteredLogs.length > 0 ? (
                      filteredLogs.map((log, index) =>
                        log.code.startsWith("Trophy") ? <PlayerTrophy key={`${log.code}-${index}`} code={log.code} /> :
                        log.code.startsWith("Penalty") ? <PlayerPenalty key={`${log.code}-${index}`} code={log.code} /> : null
                      )
                    ) : (
                      <span style={{ color: '#777', fontStyle: 'italic', fontSize: '0.9em' }}>No items yet</span>
                    )}
                  </div>
                </div>
              );
            })
        ) : (
          <div className="card">No players in this event.</div>
        )}
      </div>

      {/* Optional: Link back to standard event view or edit */}
      <div style={{ marginTop: '20px' }}>
        <Link to={`/events/${id}`}>View Standard Event</Link>
        {eventData.players.find(x => x.userId === authStatus?.id) && (
          <Link to={`/events/${id}/edit`} style={{ marginLeft: '15px' }}>Edit Event</Link>
        )}
      </div>
    </div>
  );
}