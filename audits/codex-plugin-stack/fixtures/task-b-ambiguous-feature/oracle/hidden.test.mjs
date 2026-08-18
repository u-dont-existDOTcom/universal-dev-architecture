import assert from "node:assert/strict";
import test from "node:test";
import { ServiceRegistry } from "../src/registry.mjs";

test("resolves exact, fallback, and missing services without mutation", () => {
  const exact = { id: "exact" };
  const fallback = { id: "fallback" };
  const registry = new ServiceRegistry().register("exact", exact).register("fallback", fallback);
  assert.equal(registry.resolve("exact", { fallback: "fallback" }), exact);
  assert.equal(registry.resolve("missing", { fallback: "fallback" }), fallback);
  assert.throws(() => registry.resolve("absent", { fallback: "also-absent" }), /Unknown service: absent/);
  assert.equal(registry.size, 2);
});
