export function getFriendlyDateRange(startAt: Date, endAt: Date): string {
  var date = new Date(startAt).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  var start = new Date(startAt).toLocaleTimeString(undefined, {hour: 'numeric', minute: 'numeric'});//.replace(':00:00', '').replace(':00', '').replace(' ', '').toLowerCase();
  var end = new Date(endAt).toLocaleTimeString(undefined, {hour: 'numeric', minute: 'numeric'});//.replace(':00:00', '').replace(':00', '').replace(' ', '').toLowerCase();
  return `${date} ${start} - ${end}`;
}

export function getShortDateRange(startAt: Date, endAt: Date): string {
  var date = new Date(startAt).toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
  var start = new Date(startAt).toLocaleTimeString(undefined, {hour: 'numeric', minute: 'numeric'}).replace(':00 PM', 'p').replace(':00 AM', 'a');
  var end = new Date(endAt).toLocaleTimeString(undefined, {hour: 'numeric', minute: 'numeric'}).replace(':00 PM', 'p').replace(':00 AM', 'a');
  return `${date} ${start}-${end}`;
}

export function toDateTimeLocalValue(isoValue: string | undefined | null): string {
  if (!isoValue) {
    return "";
  }
  const timestamp = Date.parse(isoValue);
  if (Number.isNaN(timestamp)) {
    return "";
  }
  const date = new Date(timestamp);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function fromDateTimeLocalValue(localValue: string): string {
  if (!localValue) {
    return "";
  }
  const date = new Date(localValue);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString();
}