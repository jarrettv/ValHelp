import { Link, useParams, Navigate, useSearchParams } from "react-router";
import { useEvent, useEventByPassword } from "./hooks/useEvent";
import Spinner from "./components/Spinner";
import Trophy from "./components/Trophy";
import TimeUntil from "./components/TimeUntil";
import TimeAgo from "./components/TimeAgo";
import { getFriendlyDateRange, getShortDateRange } from "./utils/date";
import React from "react";
import { Scoring } from "./components/Scoring";
import EventStandings from "./components/EventStandings";
import EventMap from "./components/EventMap";
import { useAuth } from "./contexts/AuthContext";
import Register from "./components/Register";
import { Event as Ev, EventStatus, GetEventState } from "./domain/event";
import EventPlayers from "./components/EventPlayers";
import Lock from "./components/Lock";

export default function Event() {
  const { id, password } = useParams();
  const [searchParams] = useSearchParams();
  const { status } = useAuth();
  
  // Determine if we're accessing by password or ID
  const isPasswordAccess = password !== undefined;
  const eventId = isPasswordAccess ? 0 : parseInt(id!);
  const queryPassword = searchParams.get('password');
  
  const { data: eventById, isPending: isPendingById } = useEvent(eventId, queryPassword || undefined);
  const { data: eventByPassword, isPending: isPendingByPassword } = useEventByPassword(password || "");
  
  const data = isPasswordAccess ? eventByPassword : eventById;
  const isPending = isPasswordAccess ? isPendingByPassword : isPendingById;

  // Redirect to ID-based URL if accessing via password and we have the data
  if (isPasswordAccess && data && !isPending) {
    return <Navigate to={`/events/${data.id}?password=${password}`} replace />;
  }

  function showRegistration(event: Ev) {
    if (event.status === EventStatus.New) return true;
    if (event.status >= EventStatus.Live && event.players.find(x => x.userId === status?.id)) return true;
    return false;
  }

  const [tab, setTab] = React.useState<'standings' | 'map'>('standings');
  const [mapAgreed, setMapAgreed] = React.useState(false);
  const [participantAcknowledged, setParticipantAcknowledged] = React.useState(false);

  return (<>
    {isPending && <div><Spinner /></div>}
    {!isPending && data && (

      <div className={data.status === EventStatus.Live ? "competition live" : "competition"}>
        { data.players.find(x => x.userId == status?.id) && <div className="alert info"><div>Last updated <TimeAgo targetTime={new Date(data.updatedAt)} /> ago by {data.updatedBy}</div>

        <Link style={{margin:"0"}} to={`/events/${data.id}/edit`}>Edit</Link>
        </div>}
        <div style={{ display: "flex" }}>
          <Trophy style={{opacity:data.status === EventStatus.Draft ? 0.2 : 1}} private={data.isPrivate} />
          <div className="competition-info">
            <h3 style={{fontSize:"1.5rem"}}>{data.name}</h3>
            <div className="timing wide">
              {getFriendlyDateRange(new Date(data.startAt), new Date(data.endAt))}
            </div>
            <div className="timing mobile">
              {getShortDateRange(new Date(data.startAt), new Date(data.endAt))}
            </div>
          </div>
          <div className="seed">
            <div style={{opacity:0.6}}>Seed</div>
            <div style={{marginTop:"-0.3rem"}}>{data.seed}</div>
          </div>
        </div>

        <EventStatusArea event={data} />

        {showRegistration(data) && <Register eventId={data.id} player={data.players.find(x => x.userId === status?.id)} />}

        {data.status >= EventStatus.Live && (
          <div className="event-tabs">
            <button className={tab === 'standings' ? 'active' : ''} onClick={() => setTab('standings')}>Standings</button>
            <button className={tab === 'map' ? 'active' : ''} onClick={() => setTab('map')}>Map</button>
          </div>
        )}

        {data.status < EventStatus.Live && <EventPlayers players={data.players} /> }
        {data.status >= EventStatus.Live && tab === 'standings' && <EventStandings players={data.players} /> }
        {data.status >= EventStatus.Live && tab === 'map' && (
          data.status === EventStatus.Live ? (
            <LiveMapGate
              isParticipant={!!data.players.find(x => x.userId === status?.id && x.status >= 0)}
              participantAcknowledged={participantAcknowledged}
              onParticipantAcknowledge={() => setParticipantAcknowledged(true)}
              mapAgreed={mapAgreed}
              onAgree={() => setMapAgreed(true)}
            >
              <EventMap event={data} onClose={() => setTab('standings')} />
            </LiveMapGate>
          ) : (
            <EventMap event={data} onClose={() => setTab('standings')} />
          )
        )}

        {data.players.length === 0 && tab === 'standings' && <div className="card">No players yet</div>}
        
        {data.isPrivate && data.privatePassword && (
          <div className="card" style={{marginBottom: "1rem"}}>
            <div style={{display: "flex", alignItems: "center", gap: "0.5rem"}}>
              <Lock style={{width: "1.5rem", height: "1.5rem"}} />
              <input 
                type="text" 
                value={`${window.location.origin}/events/private/${data.privatePassword}`}
                readOnly
                style={{flex: 1, padding: "0.5rem", fontFamily: "monospace"}}
              />
              <button 
                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/events/private/${data.privatePassword}`)}
                style={{padding: "0.5rem 1rem"}}
              >
                Copy
              </button>
            </div>
          </div>
        )}

        <p>
          {data.desc.split('\n').map((item, idx) => (
            <React.Fragment key={idx}>
              {item}
              <br />
            </React.Fragment>
          ))}
        </p>
        <Scoring scoring={data.scoring} />

      </div>
    )}
  </>
  );
}

const WarningIcon = () => (
  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" style={{ filter: 'drop-shadow(0 0 12px rgba(231, 76, 60, 0.8))' }}>
    <path d="M12 2L1 21h22L12 2z" fill="#e74c3c" stroke="#ff6b6b" strokeWidth="0.5" />
    <path d="M12 9v5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="17" r="1" fill="#fff" />
  </svg>
);

const gateStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '3rem 2rem',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '1rem',
};

const dangerBtnStyle: React.CSSProperties = {
  marginTop: '1rem',
  padding: '1rem 2.5rem',
  fontSize: '1.1rem',
  fontWeight: 700,
  color: '#fff',
  background: 'linear-gradient(135deg, #c0392b, #e74c3c)',
  border: '2px solid #ff6b6b',
  borderRadius: '8px',
  cursor: 'pointer',
  boxShadow: '0 0 20px rgba(231, 76, 60, 0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
  transition: 'box-shadow 0.2s, transform 0.1s',
};

function LiveMapGate({ isParticipant, participantAcknowledged, onParticipantAcknowledge, mapAgreed, onAgree, children }: {
  isParticipant: boolean;
  participantAcknowledged: boolean;
  onParticipantAcknowledge: () => void;
  mapAgreed: boolean;
  onAgree: () => void;
  children: React.ReactNode;
}) {
  // Participant in a live event must acknowledge they're done first
  if (isParticipant && !participantAcknowledged) {
    return (
      <div className="card" style={gateStyle}>
        <WarningIcon />
        <h2 style={{ color: '#e74c3c', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          You are competing
        </h2>
        <p style={{ maxWidth: '500px', margin: 0, lineHeight: 1.6, opacity: 0.85 }}>
          Viewing the map while competing could give you an unfair advantage.
          Only continue if you are <strong>finished participating</strong> and will
          <strong> not share</strong> map details with other competitors still playing.
        </p>
        <button
          onClick={onParticipantAcknowledge}
          style={dangerBtnStyle}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 30px rgba(231, 76, 60, 0.7), inset 0 1px 0 rgba(255,255,255,0.1)'; e.currentTarget.style.transform = 'scale(1.03)'; }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = dangerBtnStyle.boxShadow as string; e.currentTarget.style.transform = 'scale(1)'; }}
        >
          I'm done competing and won't share map details
        </button>
      </div>
    );
  }

  // Everyone must agree not to share during a live event
  if (!mapAgreed) {
    return (
      <div className="card" style={gateStyle}>
        <WarningIcon />
        <h2 style={{ color: '#e74c3c', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Tournament is LIVE
        </h2>
        <p style={{ maxWidth: '500px', margin: 0, lineHeight: 1.6, opacity: 0.85 }}>
          Do <strong>not</strong> share map details with competitors who are still playing.
          Sharing map information during a live event is unsportsmanlike and may
          result in <strong>disqualification</strong>.
        </p>
        <button
          onClick={onAgree}
          style={dangerBtnStyle}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 30px rgba(231, 76, 60, 0.7), inset 0 1px 0 rgba(255,255,255,0.1)'; e.currentTarget.style.transform = 'scale(1.03)'; }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = dangerBtnStyle.boxShadow as string; e.currentTarget.style.transform = 'scale(1)'; }}
        >
          I agree — do not share
        </button>
      </div>
    );
  }

  return <>{children}</>;
}

function EventStatusArea({ event }: { event: Ev}) {


  const [state, setState] = React.useState(GetEventState(event));

  React.useEffect(() => {
    const interval = setInterval(() => {
      setState(GetEventState(event));
    }, 1000);

    return () => clearInterval(interval);
  }, [event]);

  return (
    <>
      {state === "draft" && <div className="status info">Draft events aren't visible until you mark them ready</div>}
      {state === "wait" && <div className="status info">Event scheduled <TimeUntil targetTime={new Date(event.startAt)} /> from now</div>}
      {state === "rand" && <div className="status active">✨ Seed will roll in <TimeUntil targetTime={new Date(new Date(event.startAt).getTime() - 1000 * 60 * 5)} /> ✨</div>}
      {state === "roll" && <div className="status active">✨ Rolling a random seed... ✨</div>}
      {state === "seed" && <div className="status active">✨ Seed available, starting in <TimeUntil targetTime={new Date(event.startAt)} /> ✨</div>}
      {state === "soon" && <div className="status active">✨ Starting in <TimeUntil targetTime={new Date(event.startAt)} /> ✨</div>}
      {state === "start" && <div className="status active">✨ Starting NOW ✨</div>}
      {state === "live" && <div className="status active">LIVE for another <TimeUntil targetTime={new Date(event.endAt)} /></div>}
      {state === "over" && <div className="status info">Event ended <TimeAgo targetTime={new Date(event.endAt)} /> ago</div>}
      {state === "old" && <div className="status info">Event ended a long time ago</div>}
    </>
  );
}