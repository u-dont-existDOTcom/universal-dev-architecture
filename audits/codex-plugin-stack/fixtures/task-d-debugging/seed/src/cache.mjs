let cachedKey;
let cachedValue;

export function cached(key, compute) {
  const cacheKey = key.length;
  if (cachedKey === cacheKey) return cachedValue;
  cachedKey = cacheKey;
  cachedValue = compute();
  return cachedValue;
}

export function clearCache() {
  cachedKey = undefined;
  cachedValue = undefined;
}
