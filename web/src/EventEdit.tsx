import { useMutation, useQueryClient } from "@tanstack/react-query";
import "./Profile.css";
import { FormEvent, useEffect, useState } from "react";
import Spinner from "./components/Spinner";
import { Link, useParams, useNavigate } from "react-router";
import TimeAgo from "./components/TimeAgo";
import { useAuth } from "./contexts/AuthContext";
import { useEditEvent } from "./hooks/useEvent";
import Trophy from "./components/Trophy";
import Lock from "./components/Lock";

export default function EventEdit() {
  const { id } = useParams();
  const { status } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isPrivate, setIsPrivate] = useState(false);
  const [mode, setMode] = useState("TrophyHunt");
  const [scoringCode, setScoringCode] = useState("hunt-2025-09");

  const [hours, setHours] = useState(4);
  const [startAt, setStartAt] = useState('');

  const { isPending, error, data } = useEditEvent(Number(id ?? '0'));

  useEffect(() => {
    if (data) {
      const date = new Date(data.startAt);
      const timezoneOffset = date.getTimezoneOffset() * 60000;
      const localISOTime = new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
      setStartAt(localISOTime);
      setHours(data.hours);
      setIsPrivate(data.isPrivate);
      setMode(data.mode);
      setScoringCode(data.scoringCode);
    }
  }, [data]);
  
  useEffect(() => {
    switch (mode) {
      case "TrophyHunt":
        setScoringCode("hunt-2025-09");
        break;
      case "TrophySaga":
        setScoringCode("saga-2025-10");
        break;
      case "TrophyRush":
        setScoringCode("rush-2025-10");
        break;
      case "TrophyTrailblazer":
        setScoringCode("blaze-2025-10");
        break;
    }
  }, [mode]);

  const mutation = useMutation({
    mutationFn: async (formData) => {
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
      if (!response.ok) {
        var problem = await response.json();
        throw new Error(problem.title);
      } else {
        var data = await response.json();
        queryClient.invalidateQueries({ queryKey: ['event', data.id] });
        return navigate(`/events/${data.id}`);
      }
    },
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set('startAt', new Date(startAt).toISOString());
    const formObject: any = Object.fromEntries(formData.entries());
    
    formObject.isPrivate = formObject.isPrivate === 'on';
    formObject.id = Number(formObject.id);
    formObject.status = Number(formObject.status);
    formObject.hours = Number(formObject.hours);
    
    mutation.mutate(formObject);
  };

  const canDelete = status!.id === 1 || data?.players.some((p) => p.userId === status!.id && Math.abs(p.status) === 1);

  const onDelete = async () => {
    if (window.confirm("Are you sure you want to delete this event?")) {
      const response = await fetch(`/api/events/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        queryClient.invalidateQueries({ queryKey: ['event', id] });
        return navigate(`/events/all`);
      } else {
        var problem = await response.json();
        alert(problem.title);
      }
    }
  };

  if (isPending) return <section className="loading"><Spinner color="#fcce03" /></section>

  if (error) return <section className="alert error">An error has occurred: {error.message}</section>

  return (
    <section id="event-page">
      <form className="area" style={{ maxWidth: '530px' }} onSubmit={handleSubmit}>
        {Number(id ?? 0) === 0 && (
          <div className="alert info">Odin thanks you for organizing a new event</div>
        )}
        {Number(id ?? 0) > 1 && (
          <div className="alert info"><div>Last updated <TimeAgo targetTime={new Date(data.updatedAt)} /> ago by {data.updatedBy}</div><Link style={{ margin: "0" }} to={ id === "0" ? '/' : `/events/${id}`}>Back</Link></div>
        )}
        {mutation.isSuccess && (
          <div className="alert success" onClick={() => mutation.reset()}>✅ Event saved</div>
        )}
        {mutation.isError && (
          <div className="alert error" onClick={() => mutation.reset()}>⛔ {mutation.error.message ?? "Sorry, something went wrong"}</div>
        )}
        {mutation.isPending && (
          <div className="alert">Saving event...</div>
        )}

        <fieldset className="event-type-selector horizontal">
          <div className={`event-type-option ${mode === 'TrophyHunt' ? 'selected' : ''}`} onClick={() => setMode('TrophyHunt')}>
            <Trophy private={isPrivate} />
            <b>Hunt</b>
            <small>Vanilla drops</small>
          </div>
          <div className={`event-type-option ${mode === 'TrophySaga' ? 'selected' : ''}`} onClick={() => setMode('TrophySaga')}>
            <Trophy mode="Saga" private={isPrivate} />
            <b>Saga</b>
            <small>Modded w/ 100%</small>
          </div>
          <div className={`event-type-option ${mode === 'TrophyRush' ? 'selected' : ''}`} onClick={() => setMode('TrophyRush')}>
            <Trophy mode="Rush" private={isPrivate} />
            <b>Rush</b>
            <small>Very-hard w/ 100%</small>
          </div>
          <div className={`event-type-option ${mode === 'TrophyTrailblazer' ? 'selected' : ''}`} onClick={() => setMode('TrophyTrailblazer')}>
            <Trophy />
            <b>Trailblazer</b>
            <small>No Cost Mod w/ 100%</small>
          </div>
        </fieldset>

        <input type="hidden" name="id" value={id ?? "0"} />
        <input type="hidden" name="isPrivate" value={isPrivate.toString()} />
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="scoringCode" value={scoringCode} />

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>            
            <fieldset>
              <label htmlFor="name">Name <small style={{ opacity: 0.6 }}>(max 26 characters)</small></label>
              <input maxLength={26} style={{ width: '11rem' }} type="text" required id="name" name="name" defaultValue={data.name} />
            </fieldset>
          <fieldset>
            <label htmlFor="seed">Seed</label>
            <div>
              <input style={{ width: '7rem' }} type="text" required id="seed" name="seed" defaultValue={data.seed} />
            </div>
            <div style={{ maxWidth: '12rem', fontSize: '0.77rem', marginTop: '0.3rem', lineHeight: '0.8rem', color: '#999' }}>🎲 Use <code>(random)</code> to roll seed just before start</div>
          </fieldset>
          </div>
          <div>

          <fieldset>
            <div className="radio-group">
              {data.status < 20 && (
                <>
                  <label>
                    <input type="radio" name="status" value="0" defaultChecked={data.status === 0} />
                    Draft
                  </label>
                  <label>
                    <input type="radio" name="status" value="10" defaultChecked={data.status === 10} />
                    Ready
                  </label></>)}
              {(data.status === 20 || data.status === 30) && (
                <>
                  <label>
                    <input type="radio" name="status" value="20" defaultChecked={data.status === 20} />
                    Live
                  </label>
                  <label>
                    <input type="radio" name="status" value="30" defaultChecked={data.status === 30} />
                    Over
                  </label></>)}
              {(data.status > 30) && (
                <>
                  <label>
                    <input type="radio" name="status" value={data.status} defaultChecked={true} />
                    Old/Deleted
                  </label>
                </>)}

            </div>
          </fieldset>
          
          <fieldset style={{border: 'none', padding: '0', marginTop: '2.5rem'}}>
              <label>
                <input type="checkbox" name="isPrivate" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} /> Private
                <div style={{ maxWidth: '12rem', fontSize: '0.77rem', marginTop: '0.3rem', lineHeight: '0.8rem', color: '#999' }}><Lock width="1.1rem" height="1.1rem" /> Secret link generated automatically</div>
              </label>
            </fieldset>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <fieldset>
            <label htmlFor="startAt">Start Time</label>
            <input type="datetime-local" required id="startAt" name="startAt" step="3600" defaultValue={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </fieldset>
          <fieldset>
            <label htmlFor="hours"><strong style={{ fontSize: '1.4rem' }}>{hours}</strong> Hours</label>
            <input type="range" required id="hours" name="hours" min="1" max="8" defaultValue={data.hours} onChange={(e) => setHours(Number(e.target.value))} />
          </fieldset>
        </div>
        <fieldset style={{ marginTop: '-1rem' }}>
          <label htmlFor="desc">Description</label>
          <textarea id="desc" required name="desc" defaultValue={data.desc} />
        </fieldset>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            {canDelete && <button type="button" style={{ backgroundColor: '#882222', width: '6rem', marginRight: '2rem' }} onClick={() => onDelete()}>Delete</button>}
          <button type="button" className="secondary" style={{ width:'8rem',marginRight: '2rem' }} onClick={() => navigate(-1)}>Cancel</button>
          <button type="submit">Save</button>
        </div>
      </form>
    </section>
  )
}