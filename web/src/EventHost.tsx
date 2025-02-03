import { useMutation, useQuery } from "@tanstack/react-query";
import "./Profile.css";
import { FormEvent, useEffect, useState } from "react";
import Spinner from "./components/Spinner";

export default function EventHost() {

  const { isPending, error, data } = useQuery({
    queryKey: ['event-host'],
    queryFn: () =>
      fetch(`/api/events/host`).then((res) =>
        res.json()
      ),
  })

  const [id, setId] = useState(0);
  const [hours, setHours] = useState(4);
  const [startAt, setStartAt] = useState('');

  useEffect(() => {
    if (data) {
      setStartAt(data.startAt.slice(0, 16));
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
        throw new Error(problem.detail);
      } else {
        var data = await response.json();
        setId(data.id);
        return data;
      }
    },
  });

  useEffect(() => {
    if (startAt) {
      const date = new Date(startAt);
      const timezoneOffset = date.getTimezoneOffset() * 60000;
      const localISOTime = new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
      setStartAt(localISOTime);
    }
  }, [startAt]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    // alter the form data so the startAt is in iso UTC format
    formData.set('startAt', new Date(startAt).toISOString());
    const formObject = Object.fromEntries(formData.entries());
    mutation.mutate(formObject as any);
  };

  if (isPending) return <section className="loading"><Spinner color="#fcce03" /></section>

  if (error) return <section className="alert error">An error has occurred: {error.message}</section>

  return (
    <section id="event-page">
      <form onSubmit={handleSubmit}>
        {mutation.isSuccess && (
          <div className="alert success" onClick={() => mutation.reset()}>✅ Event saved</div>
        )}
        {mutation.isError && (
          <div className="alert error" onClick={() => mutation.reset()}>⛔ {mutation.error.message ?? "Sorry, something went wrong"}</div>
        )}
        {mutation.isPending && (
          <div className="alert">Saving event...</div>
        )}
        <input type="hidden" name="id" value={id} />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <fieldset>
            <label htmlFor="id">Name</label>
            <input style={{width:'15rem'}} type="text" required id="name" name="name" defaultValue={data.name} />
          </fieldset>
          <fieldset>
            <div className="radio-group">
            <label>
              <input type="radio" name="status" value="0" defaultChecked={data.status === 0} />
              Draft
            </label>
            <label>
              <input type="radio" name="status" value="10" defaultChecked={data.status === 10} />
              Ready
            </label>
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
          </select>
        </fieldset>
        </div>
        <fieldset>
          <label htmlFor="seed">Seed</label>
          <input style={{width:'7rem'}} type="text" required id="seed" name="seed" defaultValue={data.seed} />
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
        <fieldset style={{marginTop:'-1rem'}}>
          <label htmlFor="desc">Description</label>
          <textarea id="desc" required name="desc" defaultValue={data.desc} />
        </fieldset>
        <button type="submit">Save</button>
      </form>
    </section>
  )
}