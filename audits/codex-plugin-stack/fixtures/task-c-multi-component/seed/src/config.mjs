export function loadConfig(raw = {}) {
  return { minimumSeverity: raw.minimumSeverity ?? "info" };
}
