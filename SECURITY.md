# Security policy

## Scope

Security reports are accepted for the current `main` branch, repository automation, the repository audit, and policy or template defects that could weaken downstream repositories.

## Private reporting

Do not open a public issue for a vulnerability. Use GitHub's private
vulnerability-reporting flow from the repository Security tab when available.
If that flow is unavailable, contact the repository owner through an already
authenticated private channel.

Do not include live credentials, private keys, secret values, sensitive user material, or unnecessary raw logs. If a credential may have been exposed, rotate or revoke it before discussing remediation.

## Response and disclosure

The owner will acknowledge a report, assess cross-project impact, preserve evidence without copying secrets, and coordinate any required downstream remediation. Do not disclose a vulnerability publicly until affected repositories and credentials have been secured.

GitHub private vulnerability reporting is not claimed as enabled until its
hosted state is verified in `.github/codex-repository.json`.
