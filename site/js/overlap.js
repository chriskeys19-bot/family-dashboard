export function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return new Date(aStart).getTime() < new Date(bEnd).getTime()
    && new Date(bStart).getTime() < new Date(aEnd).getTime();
}

/** Map of item id -> other items that share a person and overlap in time. */
export function markOverlaps(items) {
  const result = new Map();
  const ensure = (id) => {
    if (!result.has(id)) result.set(id, []);
    return result.get(id);
  };
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i];
      const b = items[j];
      const shared = (a.people || []).filter((id) => (b.people || []).includes(id));
      if (!shared.length) continue;
      if (!intervalsOverlap(a.starts_at, a.ends_at, b.starts_at, b.ends_at)) continue;
      ensure(a.id).push({ id: b.id, title: b.title, people: shared });
      ensure(b.id).push({ id: a.id, title: a.title, people: shared });
    }
  }
  return result;
}
