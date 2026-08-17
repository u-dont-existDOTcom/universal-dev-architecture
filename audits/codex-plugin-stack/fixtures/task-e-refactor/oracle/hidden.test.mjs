import assert from "node:assert/strict";
import test from "node:test";
import { OrderService } from "../src/order-service.mjs";
import { priceOrder } from "../src/pricing.mjs";

test("extracted pricing seam preserves values and service delegation", () => {
  const order = { items: [{ price: 19.99, quantity: 3 }, { price: 45, quantity: 1 }] };
  const expected = { subtotal: 104.97, discount: 10.5, tax: 6.61, total: 101.08 };
  assert.deepEqual(priceOrder(order, 0.07), expected);
  assert.deepEqual(new OrderService({ taxRate: 0.07 }).quote(order), expected);
});

test("extracted seam retains item validation", () => {
  assert.throws(() => priceOrder({ items: [{ price: Number.NaN, quantity: 1 }] }, 0.1), /invalid item/);
});
