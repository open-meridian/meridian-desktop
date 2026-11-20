'use strict';
// Snapping, first step (the-workspace ruling 6): a window's edges snap to its screen's work area and to other
// desktop windows' edges within a few pixels, and a window snapped beside another meets it edge to edge.
// Pure functions: tested in test/unit/snap.test.mjs. Groups that move together are the second step, not L1.

const NEAR = 12;

function overlaps(a0, a1, b0, b1) { return a0 < b1 && b0 < a1; }

// The bounds `moving` should take: each of its edges moved onto the nearest edge within NEAR, from the work
// area or from another window whose span overlaps it on the other axis. Size is kept.
function snap(moving, others, workArea, near = NEAR) {
  const r = { ...moving };
  const xs = [workArea.x, workArea.x + workArea.width];
  const ys = [workArea.y, workArea.y + workArea.height];
  for (const o of others) {
    if (overlaps(r.y, r.y + r.height, o.y - near, o.y + o.height + near)) xs.push(o.x, o.x + o.width);
    if (overlaps(r.x, r.x + r.width, o.x - near, o.x + o.width + near)) ys.push(o.y, o.y + o.height);
  }
  const best = (edges, lead, trail) => {
    let shift = null;
    for (const e of edges) {
      for (const d of [e - lead, e - trail]) if (Math.abs(d) <= near && (shift === null || Math.abs(d) < Math.abs(shift))) shift = d;
    }
    return shift ?? 0;
  };
  r.x += best(xs, r.x, r.x + r.width);
  r.y += best(ys, r.y, r.y + r.height);
  return r;
}

// Whether two windows touch along an edge they share (for a setup's snap group).
function touching(a, b) {
  const vertical = (a.x + a.width === b.x || b.x + b.width === a.x) && overlaps(a.y, a.y + a.height, b.y, b.y + b.height);
  const horizontal = (a.y + a.height === b.y || b.y + b.height === a.y) && overlaps(a.x, a.x + a.width, b.x, b.x + b.width);
  return vertical || horizontal;
}

// Snap groups: windows connected by touching edges share a group number; a window touching none has none.
function groups(boundsList) {
  const group = boundsList.map(() => null);
  let next = 1;
  for (let i = 0; i < boundsList.length; i++) {
    if (group[i] !== null) continue;
    const stack = [i];
    const members = [];
    while (stack.length) {
      const k = stack.pop();
      if (members.includes(k)) continue;
      members.push(k);
      for (let j = 0; j < boundsList.length; j++) if (!members.includes(j) && touching(boundsList[k], boundsList[j])) stack.push(j);
    }
    if (members.length > 1) { for (const k of members) group[k] = next; next++; }
  }
  return group;
}

// Fit bounds saved on one display onto another of a different size, keeping proportions.
function fit(bounds, from, to) {
  const sx = to.width / from.width, sy = to.height / from.height;
  return {
    x: Math.round(to.x + (bounds.x - from.x) * sx), y: Math.round(to.y + (bounds.y - from.y) * sy),
    width: Math.max(200, Math.round(bounds.width * sx)), height: Math.max(120, Math.round(bounds.height * sy)),
  };
}

module.exports = { NEAR, snap, touching, groups, fit };
