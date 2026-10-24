import { sha256 } from "./canonical";

export const singleWrapperRemovalOperation = "CANONICAL_JSON_SINGLE_OUTER_ELEMENT_REMOVE_ONLY";
export const decisionMachinePrefix = "MISSION_CONTROL_CANONICAL_DECISION_V1\n";

/** Framing only. Authorization and exact source identity must be checked by the caller. */
export function removeSingleDecisionWrapper(source: string): { body: string; preservedJsonSha256: string } {
  if (!source.startsWith(decisionMachinePrefix) || source.split(decisionMachinePrefix).length !== 2) {
    throw new Error("WRAPPER_MARKER_MISMATCH");
  }
  const trim = (text: string) => text.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
  const tail = trim(source.slice(decisionMachinePrefix.length));
  const opening = /^<([a-z][a-z0-9-]{0,30})>/.exec(tail);
  if (!opening) throw new Error("EXACT_ATTRIBUTE_FREE_WRAPPER_REQUIRED");
  const closing = `</${opening[1]}>`;
  if (!tail.endsWith(closing)) throw new Error("EXACT_WRAPPER_CLOSE_REQUIRED");
  const json = trim(tail.slice(opening[0].length, -closing.length));
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new Error("WRAPPER_CONTENT_NOT_STRICT_JSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("WRAPPER_JSON_OBJECT_REQUIRED");
  // No decoding, JSON serialization, digest repair, or edits inside the JSON span.
  return { body: decisionMachinePrefix + json, preservedJsonSha256: sha256(json) };
}
