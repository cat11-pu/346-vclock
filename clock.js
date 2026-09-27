// clock.js：计数推进与合并
function byNodeName(left, right) {
  return left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0;
}

export function bumpOf(entries, node) {
  const counts = new Map();
  for (const cell of entries || []) {
    counts.set(cell[0], cell[1]);
  }
  counts.set(node, (counts.get(node) || 0) + 1);
  return Array.from(counts.entries()).sort(byNodeName);
}

export function mergeInto(base, extra) {
  const counts = new Map();
  for (const cell of base || []) {
    counts.set(cell[0], cell[1]);
  }
  for (const cell of extra || []) {
    const prev = counts.get(cell[0]);
    if (prev === undefined || cell[1] > prev) {
      counts.set(cell[0], cell[1]);
    }
  }
  return Array.from(counts.entries()).sort(byNodeName);
}
