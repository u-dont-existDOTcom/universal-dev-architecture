# Cross-project defect: idle cloud compute can consume the budget without work

**Status:** OWNER-REQUESTED BUG REPORT — diagnosis and prevention, not a released fix  
**Captured:** 2026-10-20  
**For:** UDA maintainer lane (portable resource lifecycle and cost-accounting controls)  
**Companion:** Mission Control issue #405 and `feedback/mission-control/SDF-20261020-RAILWAY-IDLE-COST-001.json`  
**Source quality:** BOUNDED_SUMMARY from owner-authorized Railway receipt and authenticated CLI/connector inspection; private identifying details and exact source correspondence intentionally not published.

## Owner outcome
The owner asked UDA and Mission Control to investigate unexpectedly high bills for scarcely used Railway VM/application infrastructure and determine how to minimize ongoing cost. **This report is a request for an actionable diagnosis and future guardrails, not permission for a new subscription, meterable test, live service shutdown, resource deletion, or priority override.**

## Observations and limitations

1. The billing statement itemized **VM Memory/vCPU** separately from ordinary **Memory/vCPU**. VM memory dominated; ordinary memory was second; CPU and network were small. Reconcile provider-specific billing pools and subscription/allowance/credits before reporting totals; the app-only project usage view **does not explain the VM portion**.
2. On inspection the owner's only listed cloud agent was **sleeping**, and every listed Railway sandbox was **destroyed**. This proves no then-running cloud-agent/sandbox compute among those listed; **it does not prove which historical VM(s) accrued the earlier charges, whether they had been idle, or whether the bill is incorrect**.
3. Among online low-traffic apps, several were configured as one always-on replica without the `sleepApplication` flag. One old smoke service had sleeping enabled but was offline after a failed deployment. A service's zero recent CPU and absent sleep flag is a *candidate for analysis*, not proof of a provider or application defect.
4. CLI project/service usage showed historical supervisory application and hotfix charges in the prior period, although those services were currently offline and their latest deployments were failed. A time-aligned reconciliation of invoice period, service/deployment lifecycle, and provider metering is required before inferring ongoing leakage.
5. Railway's published behavior is material: disconnecting from a cloud agent **does not sleep** its VM, and there is **no automatic idle timeout**. Active VM memory is billable during waiting; explicit sleep stops VM compute while retaining files. This is an unmanaged-lifecycle risk, not necessarily a Railway platform bug.

## Requested UDA actions

- **Put the lowest-cost safe lifecycle into existing task orchestration**: declare why a VM/sandbox is needed and which task holds its lease; prefer reuse over duplicate creation; at verified task completion/quiescence release that lease and sleep the VM or destroy disposable sandbox. Preserve data and long-running active/queued work; treat loss of session/process on sleep as a real consequence. Avoid inventing a second polling/scheduling control plane when the existing Mission Control reconciler can host the guard.
- **Audit metering by domain**: ledger `VM memory / VM CPU / network`, container CPU/memory/volumes, AI-agent API usage, plan fee/included allowance, credits, and different billing periods. Compute cost per *useful owner outcome*, not only total spends; preserve `unknown` when resource-to-task attribution is unavailable. Collect usage via read-only provider APIs/CLI and record provider timestamps.
- **Consider per-service Railway serverless** for request-driven low-traffic endpoints after inspecting idle request patterns and sleep/wake compatibility. Railway's serverless containers sleep after inactivity; it is not a general remedy for continuous queues, background jobs, owner-private dashboards requiring low latency, data-durability constraints, or other always-on runtime contracts. Do not silently enable for all services.
- **Guard unexpected spend** with configurable threshold(s) and owner-facing daily/weekly or billing-cycle summaries; distinguish a notification from enforced spend cessation. A hard cap or auto-teardown requiring risk/spend authority needs an explicit owner decision. Budget sampling itself should not create a costly always-on service.
- **Follow up on historical anomalies**: compare prior-period per-service costs to historical deployments and lifecycle, check residual hotfix/test instances, and record evidence-based cleanup recommendations. No historical cost should be described as still accruing based solely on a prior bill.

## Minimum verification / acceptance

1. A de-identified fixture with separate VM, container, model usage and subscription credits produces correct subtotal, net bill and scoped attribution (and flags unresolved VM-to-task history).
2. A bounded simulated lease test preserves an active task, releases an ended task, does not sleep another worker's resource, and is idempotent under retry/crash/reconnect.
3. After an **authorized** live test where incremental spend is permitted, use provider metering to demonstrate that cloud-agent sleep halts VM compute charges and does not lose persisted files on wake; separately validate any container-serverless candidate against real traffic and cold-start/error behavior. Do not initiate a metered experiment just to satisfy this report.
4. Show an owner-facing forecast/idle-VM warning with source timestamp and a clear UNKNOWN state for missing meters. Verify measured savings over a comparable billing window, allowing for workload variation.
5. Preserve the binding Mission Control research-priority hold (#385): intake and triage now; nonurgent refactoring may remain queued. This cost report does not change that priority.

## Provider reference checks

- Railway Cloud Agents, “Sleep, wake, and delete”: https://docs.railway.com/cloud-agents/manage — no idle timeout; disconnect keeps VM running; sleep preserves files/stops billing.
- Railway pricing and VM memory semantics: https://docs.railway.com/pricing/plans#vm-pricing — VM memory consumption (including OS/cache) billed while VM remains awake; Hobby included usage applied to costs.
- Railway serverless scaling guidance: https://docs.railway.com/guides/scaling-your-application#vertical-scaling — app sleep/cold-start tradeoffs.

**Owner privacy:** Public extract only. Never publish receipt number, address/email, payment detail, provider customer/workspace/resource IDs, credentials, private browser/session locators, or raw owner conversation text.