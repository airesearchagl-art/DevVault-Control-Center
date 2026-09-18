import {
  RESOURCE_STATE_HINTS,
  RESOURCE_STATE_LABELS,
  REVIEW_STATE_LABELS,
  type ResourceState,
  type ReviewState,
} from "../domain/states";

export function ReviewStateBadge({ state, testId }: { state: ReviewState; testId?: string }) {
  return (
    <span className={`badge review-${state.toLowerCase().replaceAll("_", "-")}`} data-testid={testId} data-state={state}>
      {REVIEW_STATE_LABELS[state]}
    </span>
  );
}

export function ResourceStateBadge({ state, testId }: { state: ResourceState; testId?: string }) {
  return (
    <span
      className={`badge resource-${state.toLowerCase()}`}
      title={`${RESOURCE_STATE_LABELS[state]}: ${RESOURCE_STATE_HINTS[state]}`}
      data-testid={testId}
      data-state={state}
    >
      {state}
    </span>
  );
}
