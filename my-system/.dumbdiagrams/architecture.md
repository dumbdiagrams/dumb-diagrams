# Prompt interpretation and architecture brief

Interpret the architecture before choosing layout or `.dgm` syntax. Preserve
the user's explicit choices of provider, services, counts, availability zones,
public/private placement, containment, runtime location, and connections. Ask
only when a genuine ambiguity would materially change the architecture; do not
replace an explicit choice merely because another design is more common.

## Detail-sensitive inference

- **Vague:** infer the smallest conventional structure that makes the named
  workload, qualities, and services meaningful. Mark important assumptions.
- **Normal:** fill only obvious structural gaps around the named services and
  flows. Do not widen the requested scope.
- **Detailed:** treat named components, counts, placement, boundaries, and flows
  as constraints. Inference should be local and minimal.
- **Expert/reference:** treat the request as a reconstruction specification.
  Preserve its exact architecture and intentional layout constraints unless
  they are invalid or impossible.

The less specific a request is, the more reasonable inference is permitted.
Increasing detail always reduces that freedom.

## Inference boundary

Add a component only when it is explicitly requested, strongly implied,
structurally required, or necessary for a coherent main flow. Do not add WAF,
DNS, NAT gateways, identity, secrets, monitoring, audit, threat-detection,
backup, cache, queue, or other best-practice services merely because they could
exist. “Highly available” may justify relevant multiplicity or multi-zone
placement; it does not imply every production-hardening service.

## Conceptual architecture brief

Before authoring, normalize the request into these semantics:

- provider and workload intent;
- explicit requirements and quality attributes;
- components with important counts or roles;
- inferred components, each with a short justification;
- containment, placement, and public/private constraints;
- primary directed relationships and important supporting relationships;
- exclusions, unresolved choices, and other constraints.

Keep stated and inferred decisions distinguishable. The brief may remain in
working reasoning; create a file only when the user asks for one or the project
uses it as an example/evaluation artifact. It is not a giant prose rewrite and
does not contain routing syntax.

Once the brief is stable, apply provider and layout conventions. Layout may
clarify semantics but must not invent, remove, or redirect architecture.
