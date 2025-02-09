import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import "./Profile.css";
import { FormEvent, useEffect, useState } from "react";
import Spinner from "./components/Spinner";
import { Link, useParams, useNavigate } from "react-router";
import TimeAgo from "./components/TimeAgo";
import { useAuth } from "./contexts/AuthContext";

export default function EventEdit() {
  const { id } = useParams();
  const { status } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [hours, setHours] = useState(4);
  const [startAt, setStartAt] = useState('');

  const { isPending, error, data } = useQuery({
    queryKey: ['event', Number(id) ?? 'host'],
    queryFn: () =>
      fetch(`/api/events/${id || 'host'}`).then((res) =>
        res.json()
      )
  })

  useEffect(() => {
    if (data) {
      // convert startAt to local time
      const date = new Date(data.startAt);
      const timezoneOffset = date.getTimezoneOffset() * 60000;
      const localISOTime = new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
      setStartAt(localISOTime);
      setHours(data.hours);
    }
  }, [data]);

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
    // alter the form data so the startAt is in iso UTC format
    formData.set('startAt', new Date(startAt).toISOString());
    const formObject = Object.fromEntries(formData.entries());
    mutation.mutate(formObject as any);
  };

  const canDelete = status!.id === 1;

  const onDelete = async () => {
    if (window.confirm("Are you sure you want to delete this event?")) {
      const response = await fetch(`/api/events/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        queryClient.invalidateQueries({ queryKey: ['event', id] });
        return navigate(`/events/all`);
      } else {
        alert("Failed to delete event");
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
          <div className="alert info"><div>Last updated <TimeAgo targetTime={new Date(data.updatedAt)} /> ago by {data.updatedBy}</div><Link style={{ margin: "0" }} to={`/events/${id}`}>Back</Link></div>
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
        <input type="hidden" name="id" value={id ?? "0"} />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <fieldset>
            <label htmlFor="name">Name <small style={{ opacity: 0.6 }}>(max 26 characters)</small></label>
            <input maxLength={26} style={{ width: '13rem' }} type="text" required id="name" name="name" defaultValue={data.name} />
          </fieldset>
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
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>

            <fieldset>
              <label htmlFor="mode" style={{ display: 'block', width: '6rem' }}>Mode</label>
              <select id="mode" required name="mode" defaultValue={data.mode}>
                <option value="TrophyHunt">Trophy Hunt (classic)</option>
                <option value="TrophyRush">Trophy Rush</option>
                <option value="TrophySaga">Trophy Saga</option>
                <option value="TrophyRun">Trophy Run (coming soon)</option>
              </select>
            </fieldset>
            <fieldset>
              <label htmlFor="scoringCode" style={{ display: 'block', width: '6rem' }}>Scoring</label>
              <select id="scoringCode" required name="scoringCode" defaultValue={data.scoringCode}>
                <option value="hunt-2024-11">Hunt Scoring 2024 Nov</option>
                <option value="rush-2024-11">Rush Scoring 2024 Nov</option>
                <option value="saga-2024-12">Saga Scoring 2024 Dec</option>
              </select>
            </fieldset>
          </div>
          <fieldset>
            <label htmlFor="seed">Seed</label>
            <div>
              <input style={{ width: '7rem' }} type="text" required id="seed" name="seed" defaultValue={data.seed} />
            </div>
            <div style={{ maxWidth: '12rem', fontSize: '0.77rem', marginTop: '0.3rem', lineHeight: '0.8rem', color: '#999' }}>🎲 Use <code>(random)</code> to roll seed just before start</div>
          </fieldset>
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
          <button type="submit">Save</button>
        </div>
      </form>
    </section>
  )
}