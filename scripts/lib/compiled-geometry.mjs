export const GEOMETRY_QUANTUM = 8;

export function quantize(value) {
  return Math.round(Number(value) / GEOMETRY_QUANTUM) * GEOMETRY_QUANTUM;
}

export function compiledGeometry(layout) {
  const nodes = {};
  for (const node of [...layout.nodes].sort(byId)) {
    nodes[node.id] = quantizedRect(node.obstacle);
  }
  const groups = {};
  for (const group of [...layout.groups].sort(byId)) {
    groups[group.id] = quantizedRect(group.bounds);
  }
  const routes = {};
  for (const edge of [...layout.edges].sort(byId)) {
    routes[edge.id] = edge.points.map((point) => ({
      x: quantize(point.x),
      y: quantize(point.y),
    }));
  }
  return {
    width: quantize(layout.width),
    height: quantize(layout.height),
    nodes,
    groups,
    routes,
  };
}

export function diffCompiledGeometry(expected, actual) {
  const diffs = [];
  if (!expected) {
    diffs.push("missing compiled geometry snapshot; run node scripts/update-layout-contracts.mjs");
    return diffs;
  }
  diffValue(diffs, "canvas width", expected.width, actual.width);
  diffValue(diffs, "canvas height", expected.height, actual.height);
  diffKeyedRects(diffs, "node", expected.nodes ?? {}, actual.nodes ?? {});
  diffKeyedRects(diffs, "group", expected.groups ?? {}, actual.groups ?? {});
  diffRoutes(diffs, expected.routes ?? {}, actual.routes ?? {});
  return diffs;
}

function quantizedRect(rect) {
  return {
    x: quantize(rect.x),
    y: quantize(rect.y),
    w: quantize(rect.w),
    h: quantize(rect.h),
  };
}

function byId(left, right) {
  return left.id.localeCompare(right.id);
}

function diffValue(diffs, label, expected, actual) {
  if (expected !== actual) diffs.push(`${label}: ${expected} vs ${actual}`);
}

function diffKeyedRects(diffs, kind, expected, actual) {
  for (const id of uniqueSortedIds(expected, actual)) {
    if (!(id in expected)) {
      diffs.push(`${kind} ${id} extra`);
      continue;
    }
    if (!(id in actual)) {
      diffs.push(`${kind} ${id} missing`);
      continue;
    }
    const left = expected[id];
    const right = actual[id];
    if (left.x !== right.x || left.y !== right.y || left.w !== right.w || left.h !== right.h) {
      diffs.push(`${kind} ${id}: ${formatRect(left)} vs ${formatRect(right)}`);
    }
  }
}

function diffRoutes(diffs, expected, actual) {
  for (const id of uniqueSortedIds(expected, actual)) {
    if (!(id in expected)) {
      diffs.push(`route ${id} extra`);
      continue;
    }
    if (!(id in actual)) {
      diffs.push(`route ${id} missing`);
      continue;
    }
    const left = JSON.stringify(expected[id]);
    const right = JSON.stringify(actual[id]);
    if (left !== right) diffs.push(`route ${id}: ${left} vs ${right}`);
  }
}

function uniqueSortedIds(left, right) {
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
}

function formatRect(rect) {
  return `{x:${rect.x} y:${rect.y} w:${rect.w} h:${rect.h}}`;
}
