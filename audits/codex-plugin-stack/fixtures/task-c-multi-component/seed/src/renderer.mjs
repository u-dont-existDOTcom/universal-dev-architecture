export function renderEvents(events) {
  return events.map((event) => `[${event.severity}] ${event.message}`).join("\n");
}
