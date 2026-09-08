# Platform-native deployment before new infrastructure

## Rule

Before introducing a new host, server, runtime, API boundary, database, deployment target, or other independently operated infrastructure layer for a small web surface, first inventory the first-class deployment and execution surfaces already present in the project's current platform.

Prefer an existing platform-native surface when it satisfies the current product requirements and removes an otherwise unnecessary independently deployed layer. Do not infer that custom HTML, CSS, or JavaScript requires separate web hosting.

The burden of proof is on the additional infrastructure: name the concrete requirement that the existing platform cannot satisfy. Familiarity with a VPS, static host, framework, or deployment service is not itself a requirement.

## Survey and form default

For surveys or forms that already use Google Apps Script and/or Google Sheets, evaluate an Apps Script `HtmlService` Web App before adding a separate frontend host.

The default candidate is:

```text
Apps Script HTML/CSS/JS
  -> deployed Apps Script Web App
  -> Apps Script server functions
  -> Google Sheets / existing Google services
```

Typical implementation characteristics:

- keep the survey HTML, CSS, and JavaScript inside the Apps Script project;
- serve the UI from `doGet()` with `HtmlService`;
- use `google.script.run` or other existing Apps Script server functions for submission and server-side work;
- distribute the deployed Web App URL directly when a branded origin or search indexing is not a product requirement.

This is the default candidate, not an unconditional mandate.

## Decision gate

Choose the platform-native deployment when all decision-relevant constraints are met, including the required access model, browser/runtime behavior, expected traffic, latency, reliability, data handling, security, maintainability, and acceptable URL/origin behavior.

Choose separate hosting only when a concrete requirement materially justifies it. Examples include:

- a custom domain, first-party origin, or SEO/indexing requirement the native surface cannot satisfy adequately;
- traffic, latency, concurrency, payload, execution-time, quota, or SLA requirements beyond the native platform's practical limits;
- unsupported browser, runtime, build, streaming, WebSocket, asset-pipeline, or integration requirements;
- authentication, authorization, cookie/origin, CORS, security, compliance, audit, or data-residency requirements the native platform cannot meet;
- portability, vendor-independence, deployment-control, observability, or operational requirements that are themselves product constraints rather than speculative future preferences.

Record the unmet requirement. Do not add infrastructure merely because it is conventional.

## Architecture comparison

When both approaches are plausible, hold product behavior constant and compare the minimum architectures directly.

For an Apps Script-backed survey, compare at least:

```text
A. Apps Script Web App -> Apps Script -> Sheets
B. External host/VPS -> API boundary -> Apps Script/Sheets or another backend
```

If B adds deployment, networking, failure, credential, CORS, monitoring, update, or maintenance surfaces without satisfying a requirement that A cannot meet, reject B as unnecessary complexity.

Prefer fewer independently deployed layers when capability, user experience, risk, and maintainability are otherwise equivalent.

## Anti-patterns

- Treating “custom HTML” as synonymous with “needs a separate server.”
- Adding a static host or VPS plus an API boundary when the current platform can already serve the same interactive surface.
- Selecting architecture from the tooling the agent happens to know best instead of the project's existing capabilities.
- Paying recurring infrastructure cost to solve a deployment problem the current platform already solves.
- Overcorrecting in the other direction: forcing a native platform after a verified requirement shows it is the wrong fit.

## Activation

Apply this pattern during architecture selection for surveys, forms, lightweight internal tools, dashboards, landing tools, data-collection interfaces, and comparable small interactive web surfaces whenever the project already depends on a platform that may provide its own hosting or execution surface.

For UI/UX work, also load the current `u-dont-existDOTcom/design` repository. Its stack guidance should express platform-specific implementation choices while this pattern owns the cross-project architecture principle.

## Provenance and transfer limits

Origin: owner correction on 2026-09-08 after a Google Apps Script-backed survey had been treated as if its custom HTML necessarily required separate hosting.

Promoted because the failure mode is cross-project: agents often add infrastructure before checking whether the incumbent platform already exposes an adequate deployment surface.

Transfer limit: this pattern prefers platform-native deployment only after requirement comparison. It does not claim that Apps Script or any other native host is superior when scale, origin, runtime, security, compliance, reliability, portability, or another concrete constraint selects a different architecture.
