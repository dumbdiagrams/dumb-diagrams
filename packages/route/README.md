# Connector routing rules

Automatic routing applies these rules in priority order:

1. Keep connectors orthogonal and attached to visible icon ports.
2. Preserve pinned manual routes and exact fractional port offsets. Route these least-flexible edges first.
3. Do not pass through resource cards or group-header labels, and clear a complete card before turning.
4. Avoid connector crossings and unrelated T-junctions.
5. Avoid shared collinear corridors. The only intentional exception is the first stem of a fan-out from the same source port.
6. Keep parallel connector lanes at least one grid cell apart when space permits.
7. Separate unrelated endpoints and converging arrowheads across visible quarter, center, and three-quarter ports.
8. Treat a face-only `from` or `to` declaration as a preference. The router may select a cleaner face to avoid a crossing, collision, shared corridor, or large detour.
9. After satisfying the clearance rules, prefer fewer bends, shorter paths, and less backtracking.
10. Keep routing deterministic. Long, constrained edges claim corridors before shorter flexible edges, while rendered edges retain document order.

Crossing, junction, overlap, clearance, endpoint, bend, and detour costs are all evaluated by the same path scorer. Template routing, grid fallback routing, and shortcut smoothing use that scorer so a later cleanup step cannot reintroduce a conflict that candidate selection avoided.
