# Connector routing rules

Automatic routing applies these rules in priority order:

1. Keep connectors orthogonal and attached to visible icon ports.
2. Preserve pinned manual routes and exact fractional port offsets. Route these least-flexible edges first.
3. Do not pass through resource cards or group-header labels, and clear a complete card before turning.
4. Keep parallel connector segments outside the combined group/connector stroke clearance. Perpendicular crossings remain valid when a connector enters or leaves a group.
5. Avoid connector crossings and unrelated T-junctions.
6. Avoid shared collinear corridors, including the first stems of fan-outs.
7. Keep parallel connector lanes at least one grid cell apart when space permits.
8. Separate unrelated endpoints and converging arrowheads across visible quarter, center, and three-quarter ports.
9. Treat a face-only `from` or `to` declaration as a preference. A face pointing away from the other endpoint pays a backtracking penalty, and the router may select a cleaner face to avoid a crossing, collision, shared corridor, or large detour. Fractional dragged-port offsets remain exact.
10. Place automatic edge numbers first, clear of resource icons, resource labels, boundary labels, and unrelated connectors. Then place edge labels globally so they also avoid every number and previously placed label.
11. Reserve a connector-decoration lane inside horizontal logical groups when an internal edge carries a label or sequence number.
12. After satisfying the clearance rules, prefer fewer bends, shorter paths, and less backtracking.
13. Keep routing deterministic. Long, constrained edges claim corridors before shorter flexible edges, while rendered edges retain document order.

Crossing, junction, overlap, clearance, endpoint, bend, and detour costs are all evaluated by the same path scorer. Template routing, grid fallback routing, and shortcut smoothing use that scorer so a later cleanup step cannot reintroduce a conflict that candidate selection avoided.
