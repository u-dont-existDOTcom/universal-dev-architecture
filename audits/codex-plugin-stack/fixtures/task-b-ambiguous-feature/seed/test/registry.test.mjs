import assert from "node:assert/strict";
import test from "node:test";
import { ServiceRegistry } from "../src/registry.mjs";

test("registers and retrieves services", () => {
  const primary = { id: "primary" };
  const registry = new ServiceRegistry().register("primary", primary);
  assert.equal(registry.get("primary"), primary);
  assert.equal(registry.size, 1);
});

test("rejects duplicate registration", () => {
  const registry = new ServiceRegistry().register("primary", {});
  assert.throws(() => registry.register("primary", {}), /already registered/);
});
