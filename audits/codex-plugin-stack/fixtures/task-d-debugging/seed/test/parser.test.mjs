import assert from "node:assert/strict";
import test from "node:test";
import { clearCache } from "../src/cache.mjs";
import { parseWords } from "../src/parser.mjs";

test("parses and caches one input", () => {
  clearCache();
  const first = parseWords("alpha beta gamma");
  const second = parseWords("alpha beta gamma");
  assert.deepEqual(first, ["alpha", "beta", "gamma"]);
  assert.equal(first, second);
});
