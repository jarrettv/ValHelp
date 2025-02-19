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