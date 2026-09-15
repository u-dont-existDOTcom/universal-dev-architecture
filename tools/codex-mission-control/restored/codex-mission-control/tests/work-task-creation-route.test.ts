import assert from "node:assert/strict";
import test from "node:test";
import { WORK_MODEL_ROUTING_POLICY_BASE_COMMIT, WORK_MODEL_ROUTING_POLICY_REF } from "../lib/work-execution-profile";

test("only a registered MC relay may cross the browser SYSTEM bridge; workers and wrong selections cannot", async () => {
  const keys = ["MISSION_CONTROL_INTERNAL_TOKEN", "MISSION_CONTROL_DAEMON_URL", "MISSION_CONTROL_INGEST_CREDENTIALS", "MISSION_CONTROL_SUBMISSION_RELAY_BINDINGS_JSON"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  const token = "test-browser-bridge-" + "t".repeat(40);
  process.env.MISSION_CONTROL_INTERNAL_TOKEN = "test-internal-" + "i".repeat(40);
  process.env.MISSION_CONTROL_DAEMON_URL = "http://daemon.test.invalid";
  process.env.MISSION_CONTROL_INGEST_CREDENTIALS = JSON.stringify({
    "collector:primary": { kind:"COLLECTOR", token, workers:["worker-a"], tasks:["task:a"] },
    "collector:unbound": { kind:"COLLECTOR", token, workers:["worker-a"], tasks:["task:a"] },
    "worker:a": { kind:"WORKER", token, workers:["worker-a"], tasks:["task:a"] },
  });
  process.env.MISSION_CONTROL_SUBMISSION_RELAY_BINDINGS_JSON = JSON.stringify({
    "collector:primary": { hostAlias:"test-primary", hostRole:"PRIMARY", automationWindowId:1, ownedTargetIds:["owned-target"] },
  });
  try {
    const route = await import("../app/api/work-task-creation/[worker]/route");
    for (const astra of [false, true]) {
      const profile = { model:astra ? "GPT_6_ASTRA" : "GPT_5_6_SOL", effort:astra ? "LOW" : "MEDIUM",
        routingTier:astra ? "ASTRA_LOW" : "SOL_MEDIUM", routingTriggers:astra ? ["HARD_DEBUGGING"] : [],
        fastModeRequest:"DO_NOT_ENABLE_FAST", assuranceRequirement:"SET_REQUEST_SUFFICIENT",
        policyRef:WORK_MODEL_ROUTING_POLICY_REF, routingPolicyBaseCommit:WORK_MODEL_ROUTING_POLICY_BASE_COMMIT, contractVersion:"TRUSTED_SETTER_V1" };
      const authorization = { type:"work_execution_profile_authorized", worker:"worker-a", authorization_id:"authorization:a",
        directive_id:"directive:a", directive_revision:1, task_id:"task:a", directive_artifact_sha256:"a".repeat(64), authorized_profile:profile };
      const events = [{data:authorization}, {data:{ type:"execution_directive_recorded", worker:"worker-a", status:"ACTIVE",
        directive_schema_version:3, directive_id:"directive:a", directive_revision:1, task_id:"task:a",
        directive_artifact_sha256:"a".repeat(64), source_message_id:"chat:a", source_body_sha256:"b".repeat(64), work_execution_profile:profile }}];
      let writes = 0;
      globalThis.fetch = async (_url, init) => {
        if (init?.method !== "POST") return Response.json({events});
        writes++;
        const headers = new Headers(init.headers);
        assert.equal(headers.get("x-mission-control-producer-kind"), "SYSTEM");
        const envelope = JSON.parse(String(init.body));
        assert.equal(envelope.data.producer_id, headers.get("x-mission-control-producer-id"));
        assert.equal(envelope.data.source,"TRUSTED_MANAGED_BROWSER_TASK_CREATION_BOUNDARY");
        assert.equal(envelope.data.browser_selection.fast_observed,null);
        assert.equal(envelope.data.browser_selection.model, astra ? "gpt-6-astra" : "gpt-5.6-sol");
        return Response.json({event:envelope});
      };
      const selection = {status:"DOM_SELECTION_VERIFIED", model:astra ? "gpt-6-astra" : "gpt-5.6-sol",
        effort:astra ? "low" : "medium", managed_target_verified:true, fast_observed:null};
      const input = {selection,locator:"https://chatgpt.com/c/test-created",targetId:"owned-target",automationWindowId:1};
      const call = (producer:string, body:unknown) => route.POST(new Request("https://mc.test/api/work-task-creation/worker-a?authorizationId=authorization:a",
        {method:"POST",headers:{authorization:`Bearer ${token}`,"x-mission-control-producer-id":producer},body:JSON.stringify(body)}),
        {params:Promise.resolve({worker:"worker-a"})});
      assert.equal((await call("worker:a",input)).status,403);
      assert.equal((await call("collector:unbound",input)).status,403);
      assert.equal((await call("collector:primary",{...input,targetId:"foreign"})).status,403);
      assert.equal((await call("collector:primary",{...input,selection:{...selection,effort:"max"}})).status,409);
      assert.equal((await call("collector:primary",{...input,prompt:"do-not-ingest"})).status,400);
      assert.equal(writes,0);
      assert.equal((await call("collector:primary",input)).status,200);
      assert.equal(writes,1);
    }
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});
