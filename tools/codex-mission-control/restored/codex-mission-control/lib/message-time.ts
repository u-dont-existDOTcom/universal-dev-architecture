export interface MessageTimestampDisplay {
  absolute: string;
  relative: string;
  utcIso: string | null;
  verified: boolean;
}

const DAKAR_TIME_ZONE = "Africa/Dakar";

export function formatMessageTimestamp(value: string, nowMs = Date.now()): MessageTimestampDisplay {
  const date = new Date(value);
  const timestampMs = date.getTime();
  if (!Number.isFinite(timestampMs)) {
    return {
      absolute: "TIMESTAMP UNAVAILABLE",
      relative: "unverified",
      utcIso: null,
      verified: false,
    };
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: DAKAR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const valueOf = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "??";
  const absolute = `${valueOf("year")}-${valueOf("month")}-${valueOf("day")} ${valueOf("hour")}:${valueOf("minute")}:${valueOf("second")} Africa/Dakar`;

  return {
    absolute,
    relative: relativeAge(timestampMs, nowMs),
    utcIso: date.toISOString(),
    verified: true,
  };
}

function relativeAge(timestampMs: number, nowMs: number): string {
  const deltaMs = nowMs - timestampMs;
  const future = deltaMs < 0;
  const seconds = Math.floor(Math.abs(deltaMs) / 1000);
  if (seconds < 60) return future ? "in under 1m" : "under 1m ago";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return future ? `in ${minutes}m` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return future ? `in ${hours}h` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return future ? `in ${days}d` : `${days}d ago`;
}
