import assert from "node:assert/strict";
import test from "node:test";
import { sha256 } from "../lib/canonical";
import { decisionMachinePrefix as prefix, removeSingleDecisionWrapper } from "../lib/single-decision-wrapper";

test("single wrapper removal preserves every contained JSON byte", () => {
  const json = '{\n  "text": "é &amp; <b>literal</b> </json>", "n": 1.00, "ok": true\n}';
  const result = removeSingleDecisionWrapper(prefix + '<data>\n' + json + '\n</data>');
  assert.equal(result.body, prefix + json);
  assert.equal(result.preservedJsonSha256, sha256(json));
});

test("wrapper removal rejects attributes, duplicate markers, prose, nested markup and invalid JSON", () => {
  for (const suffix of ['<data class="x">{}</data>', '<data>{}</other>', '<data>{}</data> prose',
    '<data>{} {}</data>', '<data><code>{}</code></data>', '<data>{&quot;x&quot;:1}</data>',
    '<data>{"x":}</data>', '<data>[]</data>', '<data>null</data>', '<data>{}</data><data>{}</data>']) {
    assert.throws(() => removeSingleDecisionWrapper(prefix + suffix), Error, suffix);
  }
  assert.throws(() => removeSingleDecisionWrapper(prefix + '<data>{}</data>' + prefix));
  assert.throws(() => removeSingleDecisionWrapper('preamble\n' + prefix + '<data>{}</data>'));
});
