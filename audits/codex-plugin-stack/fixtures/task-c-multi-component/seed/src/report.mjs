import { loadConfig } from "./config.mjs";
import { renderEvents } from "./renderer.mjs";
import { selectEvents } from "./selector.mjs";

export function buildReport(events, rawConfig = {}) {
  const config = loadConfig(rawConfig);
  return renderEvents(selectEvents(events, config));
}
