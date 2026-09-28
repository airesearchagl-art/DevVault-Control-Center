/**
 * Display labels for session IDs shown together (DF-03, LRP-20260929-DVCC-007).
 *
 * Real Codex IDs are time-ordered, so a fixed first-8-character abbreviation collides. Each label
 * starts as `<first N>…<last N>` with N = 8; while two distinct IDs render the same label, every ID
 * in that collision keeps 4 more characters on each side, until the label would be no shorter than
 * the ID itself, at which point the full ID is shown. Distinct full IDs are always distinct strings,
 * so the result is always unique among the distinct IDs given. Labels depend only on the set of IDs
 * (never on order, locale, titles or anything random), and the IDs themselves are never altered.
 */
export const ELLIPSIS = "…";
const INITIAL_KEEP = 8;
const KEEP_STEP = 4;

function label(id: string, keep: number): string {
  return id.length <= keep * 2 + 1 ? id : `${id.slice(0, keep)}${ELLIPSIS}${id.slice(-keep)}`;
}

export function sessionIdLabels(ids: readonly string[]): Map<string, string> {
  const distinct = [...new Set(ids)];
  const keep = new Map(distinct.map((id) => [id, INITIAL_KEEP]));
  for (;;) {
    const byLabel = new Map<string, string[]>();
    for (const id of distinct) {
      const text = label(id, keep.get(id)!);
      byLabel.set(text, [...(byLabel.get(text) ?? []), id]);
    }
    let widened = false;
    for (const group of byLabel.values()) {
      if (group.length < 2) continue;
      for (const id of group) {
        if (label(id, keep.get(id)!) === id) continue; // already full: cannot widen further
        keep.set(id, keep.get(id)! + KEEP_STEP);
        widened = true;
      }
    }
    if (!widened) {
      return new Map(distinct.map((id) => [id, label(id, keep.get(id)!)]));
    }
  }
}
