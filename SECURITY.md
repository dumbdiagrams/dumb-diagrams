# Security policy

dumb-diagrams is a local-first application. Diagram source and rendered output
should stay on the user's machine unless the user deliberately copies or
publishes them. Do not include credentials, private infrastructure names, or
customer data in issue reports or example diagrams.

## Reporting a vulnerability

Please do not report an unpatched vulnerability in a public issue. Use the
repository's **Security** tab and choose **Report a vulnerability** (GitHub
private vulnerability reporting). The report stays private, is tracked on
GitHub like an issue, and needs no email. Include the affected version,
operating system, reproduction steps, and a minimal proof of impact. Redact
secrets and personal data from all attachments.

For bugs, feature requests, documentation corrections, project questions, and
other non-security matters, use the matching GitHub issue form. Issues are
public; do not include credentials, private infrastructure names, or customer
data.

Maintainers will acknowledge a report when practical, assess supported versions,
and coordinate disclosure after a fix or mitigation is available. We do not
promise a fixed response time or security support for end-of-life versions.

## Scope and supply chain

The CLI serves Studio locally and reads files supplied by the user. Reports
involving path traversal, unintended network access, unsafe SVG/HTML handling,
dependency compromise, or release-workflow credentials are in scope. Do not
attempt denial-of-service testing against shared infrastructure.

Release publishing uses npm trusted publishing and GitHub Actions OIDC; npm
tokens must not be added to repository or CI secrets. See
[`docs/RELEASE.md`](docs/RELEASE.md) for the release controls.
