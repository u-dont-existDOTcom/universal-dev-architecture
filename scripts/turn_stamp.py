#!/usr/bin/env python3
"""Print the finished first line of a final answer: the second clock reading plus total turn time.

Owner requirement 2026-10-11-one-command-turn-stamp: the second reading and the
subtraction happen in one command, so the agent does no time arithmetic or
formatting in its reasoning. Copy the printed line as the answer's first line.

Usage:
  python3 scripts/turn_stamp.py --start "2026-10-11 00:36" --tz Africa/Nouakchott
  python3 scripts/turn_stamp.py --start "2026-10-11T00:36:12Z"

--start is the turn's first reading: the message's sent time when the surface shows
it (often only to the minute), otherwise the first clock read. A start given to the
minute is reported as a range, because the message could have been sent at any
second of that minute. Naive start times are read in --tz (default UTC).

Exit status 3 means the clock is earlier than the first reading; use the next
clock in the AGENTS.md order once.
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

_NAIVE = re.compile(r"^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$")


def parse_start(text: str, tz: timezone | ZoneInfo) -> tuple[datetime, bool]:
    """Return (start, minute_resolution)."""
    text = text.strip()
    match = _NAIVE.match(text)
    if match:
        day, hour, minute, second = match.groups()
        start = datetime.fromisoformat(f"{day}T{hour}:{minute}:{second or '00'}").replace(tzinfo=tz)
        return start, second is None
    aware = datetime.fromisoformat(text.replace("Z", "+00:00"))
    if aware.tzinfo is None:
        aware = aware.replace(tzinfo=tz)
    minute_only = bool(re.match(r"^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?:[+-]\d{2}:?\d{2}|Z)?$", text))
    return aware, minute_only


def duration(seconds: int) -> str:
    seconds = max(0, seconds)
    hours, rest = divmod(seconds, 3600)
    minutes, secs = divmod(rest, 60)
    if hours:
        return f"{hours}h{minutes:02d}m{secs:02d}s"
    if minutes:
        return f"{minutes}m{secs:02d}s"
    return f"{secs}s"


def offset_label(moment: datetime) -> str:
    offset = moment.utcoffset() or timedelta(0)
    total = int(offset.total_seconds())
    sign = "+" if total >= 0 else "-"
    hours, minutes = divmod(abs(total) // 60, 60)
    return f"UTC{sign}{hours:02d}:{minutes:02d}"


def stamp(start: datetime, minute_resolution: bool, now: datetime, tz: timezone | ZoneInfo, tz_name: str) -> str:
    local = now.astimezone(tz)
    zone = offset_label(local) if tz_name == "UTC" else f"{offset_label(local)}, {tz_name}"
    head = f"{local:%a %d %b %Y}, {local:%H:%M:%S} ({zone})"
    upper = int((now - start).total_seconds())
    if minute_resolution:
        # Sent at some second of that minute: elapsed is between upper-59 and upper.
        took = f"{duration(upper - 59)}–{duration(upper)}"
        since = f"from {start.astimezone(tz):%H:%M}"
    else:
        took = duration(upper)
        since = f"from {start.astimezone(tz):%H:%M:%S}"
    return f"{head} · total turn time {took} ({since})"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--start", required=True, help="first reading: message sent time or first clock read")
    parser.add_argument("--tz", default="UTC", help="IANA timezone for display and naive --start values (default UTC)")
    parser.add_argument("--now", help=argparse.SUPPRESS)  # fixed second reading, for tests only
    args = parser.parse_args(argv)

    tz: timezone | ZoneInfo = timezone.utc if args.tz == "UTC" else ZoneInfo(args.tz)
    start, minute_resolution = parse_start(args.start, tz)
    now = datetime.fromisoformat(args.now.replace("Z", "+00:00")) if args.now else datetime.now(timezone.utc)

    if now < start:
        print(f"clock reading {now.isoformat()} is earlier than the first reading {start.isoformat()}", file=sys.stderr)
        return 3
    print(stamp(start, minute_resolution, now, tz, args.tz))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
