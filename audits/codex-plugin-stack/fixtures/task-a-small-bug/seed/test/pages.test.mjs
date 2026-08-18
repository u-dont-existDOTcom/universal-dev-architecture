import assert from "node:assert/strict";
import test from "node:test";
import { normalizePage } from "../src/pages.mjs";

test("normalizes valid page numbers", () => {
  assert.equal(normalizePage(3, 8), 3);
  assert.equal(normalizePage("4", 8), 4);
  assert.equal(normalizePage(99, 8), 8);
});

test("rejects an invalid page-count contract", () => {
  assert.throws(() => normalizePage(1, 0), RangeError);
});
