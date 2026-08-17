import assert from "node:assert/strict";
import test from "node:test";
import { clearCache } from "../src/cache.mjs";
import { parseWords } from "../src/parser.mjs";

test("same-length inputs cannot reuse stale tokens", () => {
  clearCache();
  assert.deepEqual(parseWords("red blue"), ["red", "blue"]);
  assert.deepEqual(parseWords("cat moon"), ["cat", "moon"]);
});
