// clock.js：计数推进与合并（向量时钟按节点名升序）
export function bumpOf(entries, node) {
  const next = entries.map(function (cell) { return [cell[0], cell[1]]; });
  const found = next.find(function (cell) { return cell[0] === node; });
  if (found) {
    found[1] += 1;
  } else {
    next.push([node, 1]);
  }
  next.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
  return next;
}

export function mergeInto(base, extra) {
  const merged = new Map();
  base.concat(extra).forEach(function (cell) {
    const prev = merged.has(cell[0]) ? merged.get(cell[0]) : -Infinity;
    merged.set(cell[0], Math.max(prev, cell[1]));
  });
  return Array.from(merged.entries())
    .sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
}
