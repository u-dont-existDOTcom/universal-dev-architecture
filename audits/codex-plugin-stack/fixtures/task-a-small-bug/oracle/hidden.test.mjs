import assert from "node:assert/strict";
import test from "node:test";
import { normalizePage } from "../src/pages.mjs";

test("invalid and non-finite pages normalize to one", () => {
  for (const value of [undefined, null, "", "bad", Number.NaN, Infinity, -Infinity, 0, -3]) {
    assert.equal(normalizePage(value, 10), 1, `value ${String(value)}`);
  }
});
