# Prompt interpretation and architecture brief

Interpret the architecture before choosing layout or `.dgm` syntax. Preserve
the user's explicit choices of provider, services, counts, availability zones,
public/private placement, containment, runtime location, and connections. Ask
only when a genuine ambiguity would materially change the architecture; do not
replace an explicit choice merely because another design is more common.

## Provider selection

The authored grammar is single-provider. Select it before writing the brief or
`.dgm`: AWS/Amazon Web Services or an unambiguous AWS service selects `aws`
(First-class); Azure/Microsoft Azure selects `azure` (Experimental); and
GCP/Google Cloud selects `gcp` (Experimental). Explicit cloud-agnostic or
provider-neutral language, and requests with no provider signal, select
`cloud-agnostic` (Experimental). Omitted provider signals do not require a
question.

If signals conflict, multiple providers are named without clear multi-cloud
intent, or the request is explicitly multi-cloud, stop and ask the user how to
scope it and which provider should be primary. Do not write the brief or
`.dgm`, and do not silently mix provider catalogs. Record the selected provider
in the Goal and the matching `grammar` line. Use only that provider's catalog
types, plus cloud-agnostic actors and logical boundaries.

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

Use only minimal provider-required boundaries around a simple chain; avoid
decorative wrappers. Keep its primary path in clean reading order and use compact
resource and edge labels without repeating service names. Preserve required
response, feedback, and operations relationships explicitly, even when secondary.
During layout repair, keep requirements frozen and do not add manual coordinates
to compensate for engine behavior.

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
working reasoning only until it is written as the project artifact described in
`diagrams/README.md`. For every new diagram and meaningful semantic revision,
write or update its Markdown brief in the same change. For an existing or
custom flat `.dgm` path, place `<stem>.architecture-brief.md` beside it unless
the user directs another location. It is a concise diagnostic normalization,
not chain-of-thought or a giant prose rewrite, and it does not contain routing
syntax. Never persist credentials, secrets, or unrelated conversation.

Once the brief is stable, apply provider and layout conventions. Layout may
clarify semantics but must not invent, remove, or redirect architecture.

Before writing `.dgm`, follow `requirements.md` to capture the normalized
components, counts, relationships, and placement in a requirements contract.
Use separate stable IDs for repeated resources and each requested interaction.
Check extraction against the prompt; do not infer the contract from a repaired
diagram. A green completeness check means the source matches this contract,
not that every fact in the original prompt was extracted correctly.
