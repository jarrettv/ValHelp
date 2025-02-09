export function getFriendlyDateRange(startAt: Date, endAt: Date): string {
  var date = new Date(startAt).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  var start = new Date(startAt).toLocaleTimeString().replace(':00:00', '').replace(':00', '').replace(' ', '').toLowerCase();
  var end = new Date(endAt).toLocaleTimeString().replace(':00:00', '').replace(':00', '').replace(' ', '').toLowerCase();
  return `${date} ${start} - ${end}`;
}

export function getShortDateRange(startAt: Date, endAt: Date): string {
  var date = new Date(startAt).toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
  var start = new Date(startAt).toLocaleTimeString().replace(':00:00', '').replace(':00', '').replace(' ', '').toLowerCase();
  var end = new Date(endAt).toLocaleTimeString().replace(':00:00', '').replace(':00', '').replace(' ', '').toLowerCase();
  return `${date} ${start}-${end}`;
}