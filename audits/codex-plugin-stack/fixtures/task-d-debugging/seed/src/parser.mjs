import { cached } from "./cache.mjs";

export function parseWords(text) {
  return cached(text, () => text.trim().split(/\s+/).filter(Boolean));
}
