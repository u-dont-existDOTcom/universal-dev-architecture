import type { Health } from "@/lib/projection";

export function StatusDot({ health, pulse = false }: { health: Health; pulse?: boolean }) {
  return <span className={`status-dot ${health.toLowerCase()} ${pulse ? "pulse" : ""}`} aria-label={health} />;
}
