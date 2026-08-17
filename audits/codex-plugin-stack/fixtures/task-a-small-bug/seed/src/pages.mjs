export function normalizePage(page, totalPages) {
  if (!Number.isInteger(totalPages) || totalPages < 1) {
    throw new RangeError("totalPages must be a positive integer");
  }
  const numeric = Number(page);
  return Math.min(totalPages, Math.max(1, numeric));
}
