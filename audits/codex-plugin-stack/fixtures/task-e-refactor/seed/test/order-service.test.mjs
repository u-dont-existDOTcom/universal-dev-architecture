import assert from "node:assert/strict";
import test from "node:test";
import { OrderService } from "../src/order-service.mjs";

test("quotes discounted and taxed orders", () => {
  const service = new OrderService({ taxRate: 0.2 });
  assert.deepEqual(service.quote({ items: [{ price: 60, quantity: 2 }] }), {
    subtotal: 120,
    discount: 12,
    tax: 21.6,
    total: 129.6,
  });
});

test("preserves validation behavior", () => {
  assert.throws(() => new OrderService({ taxRate: -1 }), /invalid tax rate/);
  const service = new OrderService({ taxRate: 0.2 });
  assert.throws(() => service.quote({ items: [] }), /order must contain items/);
  assert.throws(() => service.quote({ items: [{ price: 1, quantity: 0 }] }), /invalid item/);
});
