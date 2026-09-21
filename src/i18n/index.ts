import type { ReactNode } from "react";
import type { ReviewEventType } from "../domain/events";
import type { Message } from "../domain/message";
import type { Freshness } from "../domain/freshness";
import type { GitStatus } from "../domain/git";
import type { ResourceState, ReviewState, Verdict } from "../domain/states";
import { en } from "./en";
import { ja } from "./ja";
import { DEFAULT_LOCALE, type Locale } from "./locale";
import type { Dictionary, TranslationKey, TranslationParams, Translator } from "./types";

export type { Locale } from "./locale";
export {
  DEFAULT_LOCALE,
  isLocale,
  LOCALES,
  LOCALE_NATIVE_NAMES,
} from "./locale";
export type {
  Dictionary,
  TranslationKey,
  TranslationParams,
  Translator,
} from "./types";

const DICTIONARIES: Record<Locale, Dictionary> = { ja, en };

export function dictionaryFor(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}

const PLACEHOLDER = /\{([A-Za-z0-9_]+)\}/g;

/**
 * Builds the translator for a locale. A `count` parameter selects the `<key>_one` variant when it
 * exists and the count is exactly one (English needs it; Japanese defines the single form twice).
 * A placeholder without a value is left as it is, so the parity test can see it.
 */
export function createTranslator(locale: Locale): Translator {
  const table = dictionaryFor(locale);
  return (key, params) => {
    const singular = `${key}_one` as TranslationKey;
    const useSingular = params?.count === 1 && singular in table;
    const template = table[useSingular ? singular : key] ?? key;
    if (!params) return template;
    return template.replace(PLACEHOLDER, (token, name: string) =>
      name in params ? String(params[name]) : token,
    );
  };
}

/** Puts a message named elsewhere — in the domain or a service — into the Human's language. */
export function translate(t: Translator, message: Message): string {
  if (message.messageParams === undefined) return t(message.key, message.params);
  const params: TranslationParams = { ...message.params };
  for (const [name, nested] of Object.entries(message.messageParams)) params[name] = translate(t, nested);
  return t(message.key, params);
}

/**
 * Splits an already translated sentence on the placeholders that carry markup and substitutes the
 * nodes, so a rich message stays one translatable unit and the emphasis can move with the grammar.
 */
export function formatParts(
  text: string,
  nodes: Record<string, ReactNode>,
): ReactNode[] {
  const out: ReactNode[] = [];
  let index = 0;
  let match: RegExpExecArray | null;
  const pattern = new RegExp(PLACEHOLDER.source, "g");
  while ((match = pattern.exec(text)) !== null) {
    const [token, name] = match;
    if (!(name in nodes)) continue;
    if (match.index > index) out.push(text.slice(index, match.index));
    out.push(nodes[name]);
    index = match.index + token.length;
  }
  if (index < text.length) out.push(text.slice(index));
  return out;
}

/** Label keys for values that are persisted as enums and only shown through a translation. */
export const REVIEW_STATE_KEYS: Record<ReviewState, TranslationKey> = {
  NEW: "state.review.new",
  READY_FOR_REVIEW: "state.review.readyForReview",
  REVIEWING: "state.review.reviewing",
  FIX_REQUIRED: "state.review.fixRequired",
  REVIEW_PASS: "state.review.reviewPass",
  BLOCKED: "state.review.blocked",
  SUSPENDED: "state.review.suspended",
  CLOSED: "state.review.closed",
};

export const RESOURCE_STATE_KEYS: Record<ResourceState, TranslationKey> = {
  HOT: "state.resource.hot",
  WARM: "state.resource.warm",
  COLD: "state.resource.cold",
};

export const RESOURCE_HINT_KEYS: Record<ResourceState, TranslationKey> = {
  HOT: "state.resource.hint.hot",
  WARM: "state.resource.hint.warm",
  COLD: "state.resource.hint.cold",
};

export const VERDICT_KEYS: Record<Verdict, TranslationKey> = {
  FIX_REQUIRED: "state.verdict.fixRequired",
  REVIEW_PASS: "state.verdict.reviewPass",
  BLOCKED: "state.verdict.blocked",
};

export const FRESHNESS_KEYS: Record<Freshness, TranslationKey> = {
  ALIGNED: "freshness.aligned",
  HEAD_CHANGED: "freshness.headChanged",
  REVIEW_STALE: "freshness.reviewStale",
  WORKTREE_DIRTY: "freshness.worktreeDirty",
  UNKNOWN: "freshness.unknown",
};

export const GIT_STATUS_KEYS: Record<GitStatus, TranslationKey> = {
  OK: "git.status.ok",
  NO_LOCAL_ROOT: "git.status.noLocalRoot",
  NOT_A_GIT_REPOSITORY: "git.status.notARepository",
  GIT_UNAVAILABLE: "git.status.gitUnavailable",
  TIMEOUT: "git.status.timeout",
  ERROR: "git.status.error",
};

export const EVENT_TYPE_KEYS: Record<ReviewEventType, TranslationKey> = {
  review_created: "events.type.reviewCreated",
  review_ready: "events.type.reviewReady",
  review_started: "events.type.reviewStarted",
  review_cancelled: "events.type.reviewCancelled",
  request_saved: "events.type.requestSaved",
  result_captured: "events.type.resultCaptured",
  verdict_confirmed: "events.type.verdictConfirmed",
  blocked: "events.type.blocked",
  suspended: "events.type.suspended",
  resumed: "events.type.resumed",
  closed: "events.type.closed",
  resource_changed: "events.type.resourceChanged",
  next_action_updated: "events.type.nextActionUpdated",
  metadata_updated: "events.type.metadataUpdated",
  followup_saved: "events.type.followupSaved",
  judgment_captured: "events.type.judgmentCaptured",
  risk_tier_set: "events.type.riskTierSet",
  duplicate_continued: "events.type.duplicateContinued",
  evidence_reused: "events.type.evidenceReused",
};

/** Review-type suggestions are UI chrome; the value the Human picks is stored verbatim. */
export const REVIEW_TYPE_SUGGESTION_KEYS: readonly TranslationKey[] = [
  "review.types.prReview",
  "review.types.reReview",
  "review.types.designReview",
  "review.types.planReview",
];

/**
 * Local date and time in the locale's own pattern. The stored value stays ISO-8601 UTC; an
 * unparseable value is shown as it is so nothing is invented.
 */
export function formatTimestamp(t: Translator, iso: string | null): string {
  if (iso === null) return t("time.unknown");
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => value.toString().padStart(2, "0");
  return t("time.pattern", {
    year: date.getFullYear(),
    month: pad(date.getMonth() + 1),
    day: pad(date.getDate()),
    hour: pad(date.getHours()),
    minute: pad(date.getMinutes()),
  });
}
