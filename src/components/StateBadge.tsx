import type { Freshness } from "../domain/freshness";
import type { ResourceState, ReviewState } from "../domain/states";
import { FRESHNESS_KEYS, RESOURCE_HINT_KEYS, RESOURCE_STATE_KEYS, REVIEW_STATE_KEYS } from "../i18n";
import { useT } from "../i18n/context";

/**
 * The value stays the value: `data-state` and the class fragment keep the stored enum, and only
 * what the Human reads is translated.
 */

export function ReviewStateBadge({ state, testId }: { state: ReviewState; testId?: string }) {
  const t = useT();
  return (
    <span className={`badge review-${state.toLowerCase().replaceAll("_", "-")}`} data-testid={testId} data-state={state}>
      {t(REVIEW_STATE_KEYS[state])}
    </span>
  );
}

/** Derived Freshness (Phase 2): an informational third axis, never a Review State. */
export function FreshnessBadge({ status, explanation, testId }: { status: Freshness; explanation?: string; testId?: string }) {
  const t = useT();
  return (
    <span
      className={`badge freshness-${status.toLowerCase().replaceAll("_", "-")}`}
      title={explanation}
      data-testid={testId}
      data-state={status}
    >
      {t(FRESHNESS_KEYS[status])}
    </span>
  );
}

export function ResourceStateBadge({ state, testId }: { state: ResourceState; testId?: string }) {
  const t = useT();
  return (
    <span
      className={`badge resource-${state.toLowerCase()}`}
      title={t("state.resource.tooltip", { label: t(RESOURCE_STATE_KEYS[state]), hint: t(RESOURCE_HINT_KEYS[state]) })}
      data-testid={testId}
      data-state={state}
    >
      {t(RESOURCE_STATE_KEYS[state])}
    </span>
  );
}
