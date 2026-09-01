import assert from "node:assert/strict";
import test from "node:test";
import { formatMessageTimestamp } from "../lib/message-time";

test("message timestamps are absolute in Africa/Dakar with UTC provenance and relative age", () => {
  const display = formatMessageTimestamp(
    "2026-09-01T12:34:56.000Z",
    Date.parse("2026-09-01T12:39:56.000Z"),
  );
  assert.deepEqual(display, {
    absolute: "2026-09-01 12:34:56 Africa/Dakar",
    relative: "5m ago",
    utcIso: "2026-09-01T12:34:56.000Z",
    verified: true,
  });
});

test("missing or malformed timestamps fail visibly rather than looking current", () => {
  assert.deepEqual(formatMessageTimestamp("not-a-time", 0), {
    absolute: "TIMESTAMP UNAVAILABLE",
    relative: "unverified",
    utcIso: null,
    verified: false,
  });
});
