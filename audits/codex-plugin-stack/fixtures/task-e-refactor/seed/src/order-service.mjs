function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export class OrderService {
  constructor({ taxRate }) {
    if (!Number.isFinite(taxRate) || taxRate < 0) throw new RangeError("invalid tax rate");
    this.taxRate = taxRate;
  }

  quote(order) {
    if (!order || !Array.isArray(order.items) || order.items.length === 0) {
      throw new TypeError("order must contain items");
    }
    let subtotal = 0;
    for (const item of order.items) {
      if (!Number.isFinite(item.price) || !Number.isInteger(item.quantity) || item.quantity < 1) {
        throw new TypeError("invalid item");
      }
      subtotal += item.price * item.quantity;
    }
    const discount = subtotal >= 100 ? subtotal * 0.1 : 0;
    const taxable = subtotal - discount;
    const tax = taxable * this.taxRate;
    return {
      subtotal: roundMoney(subtotal),
      discount: roundMoney(discount),
      tax: roundMoney(tax),
      total: roundMoney(taxable + tax),
    };
  }
}
