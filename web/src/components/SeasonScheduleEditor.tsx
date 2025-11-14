import { SeasonSchedule } from "../domain/season";
import { toDateTimeLocalValue, fromDateTimeLocalValue } from "../utils/date";

export interface SeasonScheduleForm extends SeasonSchedule {}

interface SeasonScheduleEditorProps {
  schedule: SeasonScheduleForm;
  onChange: (schedule: SeasonScheduleForm) => void;
}

const formatForPreview = (iso: string) => {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export default function SeasonScheduleEditor({ schedule, onChange }: SeasonScheduleEditorProps) {
  const updateField = (field: keyof SeasonScheduleForm, value: string | number) => {
    onChange({ ...schedule, [field]: value });
  };

  const updateEvent = (index: number, updates: Partial<SeasonScheduleForm["events"][number]>) => {
    const events = schedule.events.map((event, idx) => (idx === index ? { ...event, ...updates } : event));
    onChange({ ...schedule, events });
  };

  const addEvent = () => {
  const last = schedule.events.length > 0 ? schedule.events[schedule.events.length - 1] : undefined;
    const startAt = last
      ? new Date(new Date(last.startAt).getTime() + 7 * 24 * 60 * 60 * 1000)
      : new Date();
    const nextEventNum = last ? last.eventNum + 1 : schedule.eventNumInit;
    const nextName = schedule.eventNameTemplate
      .replace("{seasonNum}", schedule.seasonNum.toString())
      .replace("{eventNum}", (nextEventNum).toString());

    const events = [
      ...schedule.events,
      {
        eventNum: nextEventNum,
        name: nextName !== schedule.eventNameTemplate ? nextName : `Event ${nextEventNum}`,
        startAt: startAt.toISOString(),
        hours: last?.hours ?? 4,
      },
    ];

    onChange({ ...schedule, events });
  };

  const removeEvent = (index: number) => {
    const events = schedule.events.filter((_, idx) => idx !== index);
    onChange({ ...schedule, events });
  };

  return (
    <section className="schedule-editor">
      <header className="schedule-header">
        <div>
          <label>Schedule Name</label>
          <input
            type="text"
            value={schedule.name}
            onChange={(e) => updateField("name", e.target.value)}
            placeholder="Every other Saturday"
          />
        </div>
        <div>
          <label>Event Name Template</label>
          <input
            type="text"
            value={schedule.eventNameTemplate}
            onChange={(e) => updateField("eventNameTemplate", e.target.value)}
            placeholder="Season {seasonNum} Event {eventNum}"
          />
        </div>
        <div className="schedule-numeric">
          <label>Season #</label>
          <input
            type="number"
            value={schedule.seasonNum}
            min={0}
            onChange={(e) => updateField("seasonNum", Number(e.target.value))}
          />
        </div>
        <div className="schedule-numeric">
          <label>Starting Event #</label>
          <input
            type="number"
            value={schedule.eventNumInit}
            min={0}
            onChange={(e) => updateField("eventNumInit", Number(e.target.value))}
          />
        </div>
      </header>

      <div className="schedule-preview">
        {schedule.events.map((event, index) => (
          <div key={`${event.eventNum}-${index}`} className="schedule-node">
            <div className="schedule-dot" />
            <div className="schedule-node-body">
              <div className="schedule-node-title">
                <strong>{event.name || `Event ${event.eventNum}`}</strong>
                <span>#{event.eventNum}</span>
              </div>
              <span className="schedule-node-when">{formatForPreview(event.startAt)}</span>
              <small>{event.hours} hour{event.hours !== 1 ? "s" : ""}</small>
            </div>
          </div>
        ))}
        {schedule.events.length === 0 && <div className="schedule-empty">Add events to build the timeline</div>}
      </div>

      <div className="schedule-table">
        <div className="schedule-table-header">
          <span>#</span>
          <span>Name</span>
          <span>Start</span>
          <span>Hours</span>
          <span></span>
        </div>
        {schedule.events.map((event, index) => (
          <div className="schedule-table-row" key={`${event.eventNum}-row-${index}`}>
            <input
              type="number"
              min={0}
              value={event.eventNum}
              onChange={(e) => updateEvent(index, { eventNum: Number(e.target.value) })}
            />
            <input
              type="text"
              value={event.name}
              placeholder={`Event ${event.eventNum}`}
              onChange={(e) => updateEvent(index, { name: e.target.value })}
            />
            <input
              type="datetime-local"
              value={toDateTimeLocalValue(event.startAt)}
              onChange={(e) => updateEvent(index, { startAt: fromDateTimeLocalValue(e.target.value) })}
            />
            <input
              type="number"
              min={1}
              max={12}
              value={event.hours}
              onChange={(e) => updateEvent(index, { hours: Number(e.target.value) })}
            />
            <button type="button" className="link" onClick={() => removeEvent(index)}>
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="schedule-actions">
        <button type="button" onClick={addEvent}>Add Event</button>
      </div>
    </section>
  );
}
