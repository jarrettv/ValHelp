import "./Series.css";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SeasonDetails, SeasonSchedule, ScoreItem, SeasonAdmin, SeasonEventSummary } from "./domain/season";
import { useSeason, useSeasonDefaults } from "./hooks/useSeries";
import SeasonScheduleEditor, { SeasonScheduleForm } from "./components/SeasonScheduleEditor";
import { useAuth } from "./contexts/AuthContext";
import TimeAgo from "./components/TimeAgo";
import Trophy from "./components/Trophy";
import { EventStatus } from "./domain/event";

interface SeasonFormState {
  code: string;
  name: string;
  pitch: string;
  mode: string;
  desc: string;
  hours: number;
  isActive: boolean;
  schedule: SeasonScheduleForm;
  scoreItems: ScoreItem[];
  admins: SeasonAdmin[];
}

interface SeasonUpsertPayload {
  code: string;
  name: string;
  pitch: string;
  mode: string;
  desc: string;
  hours: number;
  isActive: boolean;
  schedule: SeasonSchedule;
  scoreItems: ScoreItem[];
  admins: SeasonAdmin[];
}

interface SeasonUpsertResponse {
  code: string;
}

const modeOptions = [
  { value: "TrophyHunt", label: "Hunt" },
  { value: "TrophySaga", label: "Saga" },
  { value: "TrophyRush", label: "Rush" },
  { value: "TrophyBlaze", label: "Blaze" },
  { value: "Versus", label: "Versus" },
];

const toFormState = (season: SeasonDetails): SeasonFormState => ({
  code: season.code ?? "",
  name: season.name ?? "",
  pitch: season.pitch ?? "",
  mode: season.mode ?? "TrophyHunt",
  desc: season.desc ?? "",
  hours: season.hours ?? 4,
  isActive: season.isActive,
  schedule: {
    name: season.schedule?.name ?? "",
    eventNameTemplate: season.schedule?.eventNameTemplate ?? "Season {seasonNum} Event {eventNum}",
    seasonNum: season.schedule?.seasonNum ?? 1,
    eventNumInit: season.schedule?.eventNumInit ?? 1,
    events: season.schedule?.events?.map(ev => ({
      eventNum: ev.eventNum,
      name: ev.name,
      startAt: ev.startAt,
      hours: ev.hours,
    })) ?? [],
  },
  scoreItems: season.scoreItems ?? [],
  admins: season.admins ?? [],
});

const linkLabelForStatus = (status: EventStatus) => {
  switch (status) {
    case EventStatus.Live:
      return "Live";
    case EventStatus.New:
      return "Upcoming";
    case EventStatus.Over:
      return "Completed";
    case EventStatus.Draft:
      return "Draft";
    default:
      return "Event";
  }
};

export default function SeasonEdit() {
  const { code: rawCode } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { status } = useAuth();

  const isNew = !rawCode || rawCode === "new";

  const seasonQuery = useSeason(rawCode ?? "");
  const defaultsQuery = useSeasonDefaults(isNew);

  const source = isNew ? defaultsQuery : seasonQuery;
  const { data, isPending, isError, error } = source;

  const [form, setForm] = useState<SeasonFormState | null>(null);

  useEffect(() => {
    if (data) {
      setForm(toFormState(data));
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: async (payload: SeasonUpsertPayload) => {
      const response = await fetch("/api/series", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        try {
          const problem = await response.json();
          throw new Error(problem.title ?? "Failed to save season");
        } catch (err) {
          if (err instanceof Error) {
            throw err;
          }
          throw new Error("Failed to save season");
        }
      }

      const result = (await response.json()) as SeasonUpsertResponse;
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["seasons"] });
      queryClient.invalidateQueries({ queryKey: ["season", result.code] });
      navigate(`/series/${result.code}/edit`, { replace: isNew });
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form) {
      return;
    }

    const payload: SeasonUpsertPayload = {
      code: form.code.trim(),
      name: form.name.trim(),
      pitch: form.pitch,
      mode: form.mode,
      desc: form.desc,
      hours: form.hours,
      isActive: form.isActive,
      schedule: {
        name: form.schedule.name,
        eventNameTemplate: form.schedule.eventNameTemplate,
        seasonNum: form.schedule.seasonNum,
        eventNumInit: form.schedule.eventNumInit,
        events: form.schedule.events.map(ev => ({
          eventNum: ev.eventNum,
          name: ev.name,
          startAt: ev.startAt,
          hours: ev.hours,
        })),
      },
      scoreItems: form.scoreItems,
      admins: form.admins,
    };

    mutation.mutate(payload);
  };

  const linkedEvents = useMemo<SeasonEventSummary[]>(() => (data?.events ?? []).slice().sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime()), [data?.events]);

  if (isPending || !form) {
    return <section className="loading">Loading season...</section>;
  }

  if (isError) {
    return <section className="alert error">{error instanceof Error ? error.message : "Season not found"}</section>;
  }

  const allowManage = status?.isActive ?? false;

  return (
    <section id="season-edit-page">
      <form className="area" onSubmit={handleSubmit}>
        <header className="season-edit-header">
          <div>
            <h2>{isNew ? "Create Season" : `Edit ${form.name}`}</h2>
            <p>Keep players in the loop with a clear schedule and up-to-date info.</p>
          </div>
          <div className="season-edit-actions">
            <button type="button" className="secondary" onClick={() => navigate(-1)}>Back</button>
            <button type="submit" disabled={mutation.isPending || !allowManage}>{mutation.isPending ? "Saving" : "Save Season"}</button>
          </div>
        </header>

        {mutation.isError && (
          <div className="alert error" onClick={() => mutation.reset()}>
            {(mutation.error as Error).message}
          </div>
        )}
        {mutation.isSuccess && (
          <div className="alert success" onClick={() => mutation.reset()}>
            ✅ Season saved
          </div>
        )}

        <fieldset className="season-grid">
          <label>
            Season Code
            <input
              type="text"
              value={form.code}
              disabled={!isNew}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="blitz-s25"
              required
            />
            <small>Used in links and API integrations. Lowercase letters, numbers, and dashes work well.</small>
          </label>

          <label>
            Display Name
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Call to Arms Trailblazer"
              required
            />
          </label>

          <label>
            Mode
            <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
              {modeOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>

          <label>
            Event Hours
            <input
              type="number"
              min={1}
              max={12}
              value={form.hours}
              onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })}
            />
          </label>

          <label className="switch">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            <span>Season is active</span>
          </label>
        </fieldset>

        <fieldset>
          <label>
            Season Pitch
            <input
              type="text"
              value={form.pitch}
              onChange={(e) => setForm({ ...form, pitch: e.target.value })}
              placeholder="The original trophy hunt, vanilla drop rates, bring skills and luck"
            />
          </label>
        </fieldset>

        <fieldset>
          <label>
            Description
            <textarea
              value={form.desc}
              onChange={(e) => setForm({ ...form, desc: e.target.value })}
              placeholder="Share rules, prizes, and how to join"
              rows={8}
            />
          </label>
        </fieldset>

        <SeasonScheduleEditor
          schedule={form.schedule}
          onChange={(schedule: SeasonScheduleForm) => setForm({ ...form, schedule })}
        />

        {!isNew && data && (
          <section className="season-summary">
            <h3>Latest Activity</h3>
            <div className="season-summary-cards">
              <div className="summary-card">
                <strong>Created by</strong>
                <span>{data.createdBy}</span>
                <small><TimeAgo targetTime={new Date(data.createdAt)} /> ago</small>
              </div>
              <div className="summary-card">
                <strong>Updated by</strong>
                <span>{data.updatedBy}</span>
                <small><TimeAgo targetTime={new Date(data.updatedAt)} /> ago</small>
              </div>
              <div className="summary-card">
                <strong>Owner</strong>
                <span>{data.ownerUsername}</span>
              </div>
            </div>
          </section>
        )}

        {!isNew && linkedEvents.length > 0 && (
          <section className="season-events">
            <h3>Linked Events</h3>
            <ul>
              {linkedEvents.map(event => (
                <li key={event.id}>
                  <Trophy />
                  <div>
                    <strong>{event.name}</strong>
                    <small>{linkLabelForStatus(event.status)} &middot; {new Date(event.startAt).toLocaleString()}</small>
                  </div>
                  <Link to={`/events/${event.id}`}>View</Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </form>
    </section>
  );
}
