// Control Read v1 real-data disclosure audit core (Phase 5A G4, HD-5A-10, Task Packet rev 3.4).
//
// Used by scripts/verify-control-read-real-data-audit.ps1. Raw local data is read here read-only (the
// DVCC data folder only) and the raw snapshot arrives ONLY through stdin; both live in this process's
// memory and nowhere else. stdout carries one JSON line with numbers, booleans, fixed codes, an opaque
// per-run sample reference and (for the harness only) the sample's identifiers it needs to press the
// button. The rendered report is built from fixed tokens and checked against a value guard.
//
// Boundaries (rev 3.4):
// - this module never runs Git and never touches a Project's local root (it is only a string here);
//   Git facts come from DVCC's own validated observation, read from its UI by the harness;
// - a source value is lawful in a snapshot only when it is bound to the selected source (contract
//   vocabulary, the selected Project's identity / recorded values, DVCC's observation) or is a value
//   the response itself generated inside the run's time window — never because of its shape alone;
// - nothing here writes a file, logs a value or prints an error message: errors become fixed codes.
//
// The Control Read vocabulary below is an independent copy (a test oracle); the tests prove it equals
// src/domain/controlRead/contract.ts and that real `readControl` output passes the allowlist.

import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------------------------
// Contract vocabulary (independent oracle)
// ---------------------------------------------------------------------------------------------

export const VOCABULARY = Object.freeze({
  contract: "dvcc.control-read",
  version: 1,
  operation: "get_control_snapshot",
  factClasses: ["OBSERVED", "HUMAN_CONFIRMED", "DERIVED", "UNKNOWN", "BLOCKED"],
  ruleIds: ["project.local-root-presence@1", "round.result-presence@1", "round.judgment-presence@1", "freshness.derive@1"],
  unknownReasons: [
    "NOT_OBSERVED",
    "OBSERVATION_INVALIDATED",
    "GIT_UNAVAILABLE",
    "NO_LOCAL_ROOT",
    "NOT_A_GIT_REPOSITORY",
    "OBSERVATION_FAILED",
    "HEAD_NOT_COMPARABLE",
    "NOTHING_RECORDED",
    "PROJECT_NOT_REGISTERED",
    "NOT_TRACKED_BY_DVCC",
  ],
  blockedReasons: ["WITHHELD_BY_POLICY", "INVALID_SOURCE_VALUE"],
  confirmations: ["EXPLICIT", "ENTERED"],
  omittedSections: ["ide_sessions", "runs", "action_eligibility", "queue_order"],
  limitKinds: ["MAX_REVIEWS", "MAX_ROUNDS"],
  reviewStates: ["NEW", "READY_FOR_REVIEW", "REVIEWING", "FIX_REQUIRED", "REVIEW_PASS", "BLOCKED", "SUSPENDED", "CLOSED"],
  resourceStates: ["HOT", "WARM", "COLD"],
  verdicts: ["FIX_REQUIRED", "REVIEW_PASS", "BLOCKED"],
  riskTiers: ["TIER_0", "TIER_1", "TIER_2"],
  freshnessValues: ["ALIGNED", "HEAD_CHANGED", "REVIEW_STALE", "WORKTREE_DIRTY"],
  readableHealth: ["ok", "restored_from_backup"],
  bindings: ["EXACT", "SHORT", "MISSING"],
});

/** Every key a v1 snapshot may carry. */
export const SNAPSHOT_KEYS = Object.freeze([
  "contract", "version", "operation", "snapshot_id", "generated_at", "complete", "limits_applied", "omitted_sections", "data",
  "project", "reviews", "unattributable_review_count", "external_gates",
  "project_id", "registry_health", "repository", "local_root", "git", "head", "dirty", "detached", "review_session_ids", "closed_review_count",
  "review_session_id", "file_health", "review_state", "resource_state", "pr_number", "current_round", "rounds", "freshness",
  "round", "expected_head", "reviewed_head", "result_captured", "verdict", "judgment_captured", "risk_tier",
  "class", "value", "observed_at", "source", "evidence_ref", "confirmation", "recorded_at", "binding", "rule", "derived_from",
  "basis_observed_at", "basis_recorded_at", "unknown_reason", "blocked_reason", "host", "owner", "name", "path",
]);

/**
 * How DVCC's Review detail renders a Git observation (src/i18n ja / en; pinned by tests): the status
 * label of an OK observation, and the branch cell of a detached HEAD.
 */
export const GIT_UI = Object.freeze({
  statusOkLabels: ["観測済み", "Observed"],
  detachedLabel: "detached HEAD",
});

export const PROJECT_ID = /^[a-z0-9][a-z0-9-]{1,63}$/;
export const REVIEW_ID = /^rv-\d{8}-[a-z0-9]{6}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const FULL_HEAD = /^[0-9a-f]{40}$/;
const RECORDED_HEAD = /^[0-9a-f]{7,40}$/;
const SNAPSHOT_ID = /^snap-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

export const EVIDENCE_REF_GRAMMAR = Object.freeze([
  /^dvcc:project\/[a-z0-9][a-z0-9-]{1,63}$/,
  /^dvcc:project\/[a-z0-9][a-z0-9-]{1,63}\/repository$/,
  /^dvcc:project\/[a-z0-9][a-z0-9-]{1,63}\/local-root$/,
  /^dvcc:review\/rv-\d{8}-[a-z0-9]{6}$/,
  /^dvcc:review\/rv-\d{8}-[a-z0-9]{6}\/field\/(review-state|resource-state|pr-number)$/,
  /^dvcc:review\/rv-\d{8}-[a-z0-9]{6}\/round\/[1-9]\d{0,2}\/(expected-head|reviewed-head|result|verdict|judgment|risk-tier)$/,
  /^dvcc:git-observation\/[a-z0-9][a-z0-9-]{1,63}\/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/,
]);

/**
 * Shapes of values the contract carries (hex SHA, ISO time, snapshot / review id, EvidenceRef). A
 * shape proves nothing about where a value came from: it is used only to classify a forbidden value
 * that occurs in the snapshot without a source-bound explanation as an UNRESOLVED overlap.
 */
export const MACHINE_SHAPED = Object.freeze([/^[0-9a-f]{7,40}$/i, ISO, SNAPSHOT_ID, REVIEW_ID, ...EVIDENCE_REF_GRAMMAR]);

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isInt = (v, min = 0) => Number.isInteger(v) && v >= min;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const nonEmpty = (v) => typeof v === "string" && v.trim() !== "";
const iso = (v) => typeof v === "string" && ISO.test(v);

// ---------------------------------------------------------------------------------------------
// A. Output allowlist
// ---------------------------------------------------------------------------------------------

/**
 * Validates a get_control_snapshot response against Control Read v1. `unknownFields` counts keys
 * outside the contract; `violations` counts missing keys and values outside their grammar;
 * `decided` is false only when validation itself could not finish.
 */
export function validateSnapshot(snapshot) {
  const ctx = { unknownFields: 0, violations: 0, decided: true };
  const bad = () => {
    ctx.violations += 1;
  };
  const shape = (v, allowed, required = allowed) => {
    if (!isObj(v)) {
      bad();
      return false;
    }
    for (const key of Object.keys(v)) if (!allowed.includes(key)) ctx.unknownFields += 1;
    for (const key of required) if (!has(v, key)) bad();
    return true;
  };
  const ref = (v) => {
    if (typeof v !== "string" || EVIDENCE_REF_GRAMMAR.filter((p) => p.test(v)).length !== 1) bad();
  };
  const nullableIso = (v) => {
    if (!(v === null || iso(v))) bad();
  };
  const fact = (v, allowedClasses, valueOk, humanExtra = []) => {
    if (!isObj(v)) return bad();
    if (!allowedClasses.includes(v.class)) return bad();
    switch (v.class) {
      case "OBSERVED":
        shape(v, ["class", "value", "observed_at", "source", "evidence_ref"]);
        if (!iso(v.observed_at) || v.source !== "GIT_OBSERVATION") bad();
        ref(v.evidence_ref);
        if (!valueOk(v.value)) bad();
        break;
      case "HUMAN_CONFIRMED":
        shape(v, ["class", "value", "confirmation", "recorded_at", "evidence_ref", ...humanExtra], ["class", "value", "confirmation", "recorded_at", "evidence_ref"]);
        if (!VOCABULARY.confirmations.includes(v.confirmation)) bad();
        nullableIso(v.recorded_at);
        ref(v.evidence_ref);
        if (!valueOk(v.value)) bad();
        if (has(v, "binding") && !VOCABULARY.bindings.includes(v.binding)) bad();
        break;
      case "DERIVED":
        shape(v, ["class", "value", "rule", "derived_from", "basis_observed_at"]);
        if (!VOCABULARY.ruleIds.includes(v.rule)) bad();
        if (!Array.isArray(v.derived_from)) bad();
        else v.derived_from.forEach(ref);
        nullableIso(v.basis_observed_at);
        if (!valueOk(v.value)) bad();
        break;
      case "UNKNOWN":
        shape(v, ["class", "unknown_reason"]);
        if (!VOCABULARY.unknownReasons.includes(v.unknown_reason)) bad();
        break;
      case "BLOCKED":
        shape(v, ["class", "blocked_reason"]);
        if (!VOCABULARY.blockedReasons.includes(v.blocked_reason)) bad();
        break;
    }
  };
  const PRESENCE = ["class", "value", "rule", "derived_from", "basis_observed_at", "basis_recorded_at"];
  const presence = (v, rule, extra = []) => {
    if (!shape(v, [...PRESENCE, ...extra], PRESENCE)) return;
    if (v.class !== "DERIVED" || v.rule !== rule || typeof v.value !== "boolean" || v.basis_observed_at !== null) bad();
    if (!Array.isArray(v.derived_from)) bad();
    else v.derived_from.forEach(ref);
    nullableIso(v.basis_recorded_at);
  };
  const oneOf = (allowed) => (v) => allowed.includes(v);
  const unknownOnly = (v, reason) => {
    if (!shape(v, ["class", "unknown_reason"]) || v.class !== "UNKNOWN" || v.unknown_reason !== reason) bad();
  };

  try {
    if (!shape(snapshot, ["contract", "version", "operation", "snapshot_id", "generated_at", "complete", "limits_applied", "omitted_sections", "data"])) return ctx;
    if (snapshot.contract !== VOCABULARY.contract || snapshot.version !== VOCABULARY.version || snapshot.operation !== VOCABULARY.operation) bad();
    if (typeof snapshot.snapshot_id !== "string" || !SNAPSHOT_ID.test(snapshot.snapshot_id)) bad();
    if (!iso(snapshot.generated_at)) bad();
    if (typeof snapshot.complete !== "boolean") bad();
    if (!Array.isArray(snapshot.limits_applied) || snapshot.limits_applied.some((k) => !VOCABULARY.limitKinds.includes(k))) bad();
    else if (snapshot.complete !== (snapshot.limits_applied.length === 0)) bad();
    if (!Array.isArray(snapshot.omitted_sections) || snapshot.omitted_sections.join(",") !== VOCABULARY.omittedSections.join(",")) bad();

    const data = snapshot.data;
    if (!shape(data, ["project", "reviews", "unattributable_review_count", "external_gates"])) return ctx;
    if (!isInt(data.unattributable_review_count)) bad();
    unknownOnly(data.external_gates, "NOT_TRACKED_BY_DVCC");

    const project = data.project;
    if (shape(project, ["project_id", "registry_health", "repository", "local_root", "git", "review_session_ids", "closed_review_count"])) {
      if (typeof project.project_id !== "string" || !PROJECT_ID.test(project.project_id)) bad();
      if (!VOCABULARY.readableHealth.includes(project.registry_health)) bad();
      fact(project.repository, ["HUMAN_CONFIRMED", "UNKNOWN", "BLOCKED"], (v) => {
        if (!shape(v, ["host", "owner", "name"])) return false;
        return v.host === "github.com" && OWNER.test(String(v.owner)) && REPO.test(String(v.name));
      });
      const lr = project.local_root;
      if (isObj(lr) && lr.value === true) {
        presence(lr, "project.local-root-presence@1", ["path"]);
        if (!shape(lr.path, ["class", "blocked_reason"]) || lr.path.class !== "BLOCKED" || lr.path.blocked_reason !== "WITHHELD_BY_POLICY") bad();
      } else {
        presence(lr, "project.local-root-presence@1");
      }
      if (shape(project.git, ["head", "dirty", "detached"])) {
        fact(project.git.head, ["OBSERVED", "UNKNOWN", "BLOCKED"], (v) => typeof v === "string" && FULL_HEAD.test(v));
        fact(project.git.dirty, ["OBSERVED", "UNKNOWN", "BLOCKED"], (v) => typeof v === "boolean");
        fact(project.git.detached, ["OBSERVED", "UNKNOWN", "BLOCKED"], (v) => typeof v === "boolean");
      }
      if (!Array.isArray(project.review_session_ids) || project.review_session_ids.some((id) => typeof id !== "string" || !REVIEW_ID.test(id))) bad();
      if (!isInt(project.closed_review_count)) bad();
    }

    if (!Array.isArray(data.reviews)) bad();
    else
      for (const review of data.reviews) {
        if (!shape(review, ["review_session_id", "project_id", "file_health", "review_state", "resource_state", "pr_number", "current_round", "rounds", "freshness"])) continue;
        if (typeof review.review_session_id !== "string" || !REVIEW_ID.test(review.review_session_id)) bad();
        if (review.project_id !== project?.project_id) bad();
        if (!VOCABULARY.readableHealth.includes(review.file_health)) bad();
        fact(review.review_state, ["HUMAN_CONFIRMED", "BLOCKED"], oneOf(VOCABULARY.reviewStates));
        fact(review.resource_state, ["HUMAN_CONFIRMED", "BLOCKED"], oneOf(VOCABULARY.resourceStates));
        fact(review.pr_number, ["HUMAN_CONFIRMED", "UNKNOWN", "BLOCKED"], (v) => isInt(v, 1));
        if (!(review.current_round === null || isInt(review.current_round, 1))) bad();
        fact(review.freshness, ["DERIVED", "UNKNOWN", "BLOCKED"], oneOf(VOCABULARY.freshnessValues));
        if (!Array.isArray(review.rounds)) bad();
        else
          for (const round of review.rounds) {
            if (!shape(round, ["round", "expected_head", "reviewed_head", "result_captured", "verdict", "judgment_captured", "risk_tier"])) continue;
            if (!isInt(round.round, 1)) bad();
            fact(round.expected_head, ["HUMAN_CONFIRMED", "UNKNOWN", "BLOCKED"], (v) => typeof v === "string" && RECORDED_HEAD.test(v), ["binding"]);
            fact(round.reviewed_head, ["HUMAN_CONFIRMED", "UNKNOWN", "BLOCKED"], (v) => typeof v === "string" && RECORDED_HEAD.test(v));
            presence(round.result_captured, "round.result-presence@1");
            fact(round.verdict, ["HUMAN_CONFIRMED", "UNKNOWN", "BLOCKED"], oneOf(VOCABULARY.verdicts));
            presence(round.judgment_captured, "round.judgment-presence@1");
            fact(round.risk_tier, ["HUMAN_CONFIRMED", "UNKNOWN", "BLOCKED"], oneOf(VOCABULARY.riskTiers));
          }
      }
  } catch {
    ctx.decided = false;
  }
  return ctx;
}

// ---------------------------------------------------------------------------------------------
// Source binding: what the selected source lawfully puts into this snapshot
// ---------------------------------------------------------------------------------------------

/** Clock tolerance between the harness's run windows and DVCC's own timestamps (same machine). */
export const WINDOW_TOLERANCE_MS = 2000;

export function withinWindow(value, window) {
  if (!iso(value) || !Array.isArray(window) || window.length !== 2) return false;
  const [from, to] = window;
  const t = Date.parse(value);
  return Number.isFinite(from) && Number.isFinite(to) && t >= from - WINDOW_TOLERANCE_MS && t <= to + WINDOW_TOLERANCE_MS;
}

/** DVCC's own Git observation as its Review detail rendered it (read by the harness through CDP). */
export function interpretGitUi(ui) {
  const none = { statusOk: false, head: null, branch: null, detached: null };
  if (!isObj(ui)) return none;
  const statusOk = GIT_UI.statusOkLabels.includes(ui.status);
  if (!statusOk) return none;
  const head = typeof ui.head === "string" && FULL_HEAD.test(ui.head) ? ui.head : null;
  if (typeof ui.branch !== "string" || ui.branch === "") return { statusOk, head, branch: null, detached: null };
  if (ui.branch === GIT_UI.detachedLabel) return { statusOk, head, branch: null, detached: true };
  return { statusOk, head, branch: ui.branch, detached: false };
}

function repositoryIdentity(url) {
  const m = typeof url === "string" ? /^https:\/\/github\.com\/([^/]+)\/([^/]+)$/.exec(url.trim()) : null;
  return m ? { owner: m[1], name: m[2] } : null;
}

/** Readable, non-CLOSED reviews of the project: the only reviews the snapshot may name. */
function projectReviews(folder, projectId) {
  const out = new Map();
  for (const r of folder.reviews) if (r.session && r.session.projectId === projectId && r.session.reviewState !== "CLOSED") out.set(r.id, r.session);
  return out;
}

const ROUND_REF_KINDS = ["expected-head", "reviewed-head", "result", "verdict", "judgment", "risk-tier"];

/** Every OBSERVED `observed_at` of the snapshot that lies inside the harness's refresh window. */
function observedAtsInWindow(parsed, windows) {
  const out = new Set();
  const git = parsed?.data?.project?.git;
  for (const key of ["head", "dirty", "detached"]) {
    const f = git?.[key];
    if (f?.class === "OBSERVED" && withinWindow(f.observed_at, windows?.refresh)) out.add(f.observed_at);
  }
  return out;
}

/**
 * The source binding of one audit: contract vocabulary, the selected Project's identity and its
 * reviews' recorded heads / timestamps, DVCC's observed HEAD, and the values the response generated
 * itself inside the run window. `refs` are the only EvidenceRefs the snapshot may contain.
 */
export function sourceBinding(folder, project, parsed, windows, gitUi) {
  const repo = repositoryIdentity(project.repositoryUrl);
  const reviews = projectReviews(folder, project.projectId);
  const heads = new Set();
  const times = new Set();
  const refs = new Set([`dvcc:project/${project.projectId}`, `dvcc:project/${project.projectId}/repository`, `dvcc:project/${project.projectId}/local-root`]);
  for (const [id, s] of reviews) {
    refs.add(`dvcc:review/${id}`);
    for (const field of ["review-state", "resource-state", "pr-number"]) refs.add(`dvcc:review/${id}/field/${field}`);
    s.rounds.forEach((round, index) => {
      for (const kind of ROUND_REF_KINDS) refs.add(`dvcc:review/${id}/round/${index + 1}/${kind}`);
      for (const h of [round?.expectedHead, round?.reviewedHead]) if (nonEmpty(h)) heads.add(h);
      for (const t of [round?.resultCapturedAt, round?.verdictConfirmedAt, round?.judgmentCapturedAt]) if (nonEmpty(t)) times.add(t);
    });
  }
  const observedAts = observedAtsInWindow(parsed, windows);
  for (const at of observedAts) refs.add(`dvcc:git-observation/${project.projectId}/${at}`);
  const owned = [];
  if (typeof parsed?.snapshot_id === "string" && SNAPSHOT_ID.test(parsed.snapshot_id)) owned.push(parsed.snapshot_id);
  if (withinWindow(parsed?.generated_at, windows?.copy)) owned.push(parsed.generated_at);
  const git = interpretGitUi(gitUi);
  const legit = new Set([
    ...VOCABULARY_TOKENS,
    project.projectId,
    ...(repo ? [repo.owner, repo.name] : []),
    ...reviews.keys(),
    ...heads,
    ...times,
    ...(git.head ? [git.head] : []),
    ...observedAts,
    ...owned,
    ...refs,
  ]);
  return { legit, refs, reviews, heads, times, observedAts };
}

// ---------------------------------------------------------------------------------------------
// B. Exact sensitive-value comparison  /  C. Pattern-based leakage
// ---------------------------------------------------------------------------------------------

export const EXACT_CATEGORIES = Object.freeze(["absolute_path", "free_text", "thread_pointer", "git_branch", "provider_identifier"]);

/** Long forbidden values are searched inside every snapshot string; shorter ones must equal one. */
export const SUBSTRING_MIN_LENGTH = 12;

/** Every string of the parsed snapshot: values (with their path) and keys. */
export function snapshotStrings(value, at = [], into = []) {
  if (typeof value === "string") into.push({ at: at.join("."), text: value });
  else if (Array.isArray(value)) value.forEach((item, index) => snapshotStrings(item, [...at, String(index)], into));
  else if (isObj(value))
    for (const [key, item] of Object.entries(value)) {
      into.push({ at: [...at, "#key"].join("."), text: key });
      snapshotStrings(item, [...at, key], into);
    }
  return into;
}

const VOCABULARY_TOKENS = Object.freeze([
  ...SNAPSHOT_KEYS,
  ...Object.values(VOCABULARY).flatMap((v) => (Array.isArray(v) ? v : typeof v === "string" ? [v] : [])),
  "github.com",
  "GIT_OBSERVATION",
]);

const SEPARATOR = "\u0000";
function haystack(texts) {
  return { set: new Set(texts), joined: `${SEPARATOR}${texts.join(SEPARATOR)}${SEPARATOR}` };
}
function occursIn(needle, hay) {
  return hay.set.has(needle) || (needle.length >= SUBSTRING_MIN_LENGTH && hay.joined.includes(needle));
}

const normalizePath = (s) => s.replace(/\\/g, "/").toLowerCase();

/** A forbidden value equal to (or, when long, contained in) a source-bound lawful value. */
export function isSourceBound(value, legit) {
  const hay = legit instanceof Set ? haystack([...legit]) : legit;
  return occursIn(value, hay);
}

/**
 * Forbidden source values found in the snapshot. Per distinct value:
 * - source-bound lawful → excluded (resolved overlap, counted);
 * - occurs in the snapshot and is machine-shaped without a source-bound explanation → UNRESOLVED
 *   overlap (counted; the run cannot PASS);
 * - occurs in the snapshot otherwise → a leak in its category.
 */
export function exactLeaks(parsed, forbidden, legit) {
  const texts = snapshotStrings(parsed).map((s) => s.text);
  const hay = haystack(texts);
  const pathHay = haystack(texts.map(normalizePath));
  const legitHay = haystack([...legit]);
  const counts = { overlapsResolved: 0, overlapsUnresolved: 0 };
  for (const category of EXACT_CATEGORIES) counts[category] = 0;
  for (const category of EXACT_CATEGORIES) {
    const seen = new Set();
    for (const raw of forbidden[category] ?? []) {
      if (typeof raw !== "string") continue;
      const value = raw.trim();
      if (value === "" || seen.has(value)) continue;
      seen.add(value);
      if (isSourceBound(value, legitHay)) {
        counts.overlapsResolved += 1;
        continue;
      }
      const hit = category === "absolute_path" ? occursIn(normalizePath(value), pathHay) : occursIn(value, hay);
      if (!hit) continue;
      if (MACHINE_SHAPED.some((p) => p.test(value))) counts.overlapsUnresolved += 1;
      else counts[category] += 1;
    }
  }
  return counts;
}

export const PATTERNS = Object.freeze({
  absolute_path: [
    /(^|[^A-Za-z0-9])[A-Za-z]:[\\/]/,
    /\\\\[^\\\s]+\\/,
    /(^|[^:A-Za-z0-9])\/\/[A-Za-z0-9._$-]+\/[A-Za-z0-9._$-]+/,
    /file:\/\//i,
    /(^|[^A-Za-z0-9])\/(home|Users|mnt|var|tmp|private)\//,
  ],
  credential: [
    /gh[pousr]_[A-Za-z0-9]{20,}/,
    /github_pat_[A-Za-z0-9_]{20,}/,
    /(^|[^A-Za-z0-9])sk-[A-Za-z0-9_-]{16,}/,
    /AKIA[0-9A-Z]{16}/,
    /bearer\s+[A-Za-z0-9._~+/=-]{16,}/i,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  ],
  provider_identifier: [/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i],
  thread_pointer: [/chatgpt\.com/i, /chat\.openai\.com/i],
});

/** Snapshot strings (values and keys) matching each pattern category. */
export function patternHits(parsed) {
  const strings = snapshotStrings(parsed);
  const hits = {};
  for (const [category, patterns] of Object.entries(PATTERNS)) {
    let count = 0;
    for (const { at, text } of strings) {
      // The response identifier is a random UUID by contract; it is not a provider identifier.
      if (category === "provider_identifier" && at === "snapshot_id") continue;
      if (patterns.some((p) => p.test(text))) count += 1;
    }
    hits[category] = count;
  }
  return hits;
}

const PATTERN_CANARIES = Object.freeze({
  absolute_path: "C:\\audit-canary\\folder",
  credential: `ghp_${"A".repeat(36)}`,
  provider_identifier: "00000000-0000-4000-8000-000000000000",
  thread_pointer: "https://chatgpt.com/c/audit-canary",
});

function plant(parsed, value) {
  if (isObj(parsed) && isObj(parsed.data) && isObj(parsed.data.project)) {
    return { ...parsed, data: { ...parsed.data, project: { ...parsed.data.project, audit_canary: value } } };
  }
  return { ...(isObj(parsed) ? parsed : {}), audit_canary: value };
}

/**
 * Proves the detectors are live on THIS data: one real forbidden value per category (and one
 * synthetic value per pattern) is planted into a copy of the snapshot, in memory, and each must be
 * found — as a leak of its category and by the allowlist. Returns false when any is missed.
 */
export function detectorsLive(parsed, forbidden, legit) {
  try {
    const legitHay = haystack([...legit]);
    for (const category of EXACT_CATEGORIES) {
      const probe = (forbidden[category] ?? [])
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .find((v) => v !== "" && !isSourceBound(v, legitHay) && !MACHINE_SHAPED.some((p) => p.test(v)));
      if (probe === undefined) continue;
      const planted = plant(parsed, probe);
      if (exactLeaks(planted, { [category]: [probe] }, legit)[category] < 1) return false;
      if (validateSnapshot(planted).unknownFields < 1) return false;
    }
    for (const [category, sample] of Object.entries(PATTERN_CANARIES)) {
      if (patternHits(plant(parsed, sample))[category] < 1) return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Positive assertions (the contract is useful, not only silent) — source-bound
// ---------------------------------------------------------------------------------------------

function evidenceRefs(value, into = []) {
  if (Array.isArray(value)) value.forEach((item) => evidenceRefs(item, into));
  else if (isObj(value))
    for (const [key, item] of Object.entries(value)) {
      if (key === "evidence_ref" && typeof item === "string") into.push(item);
      else if (key === "derived_from" && Array.isArray(item)) into.push(...item.filter((r) => typeof r === "string"));
      else evidenceRefs(item, into);
    }
  return into;
}

function recordedTimes(value, into = []) {
  if (Array.isArray(value)) value.forEach((item) => recordedTimes(item, into));
  else if (isObj(value))
    for (const [key, item] of Object.entries(value)) {
      if ((key === "recorded_at" || key === "basis_recorded_at") && item !== null) into.push(item);
      else recordedTimes(item, into);
    }
  return into;
}

/** Returns fixed failure codes only. */
export function expectedFacts(parsed, exp) {
  const failures = new Set();
  const fail = (code) => failures.add(code);
  try {
    if (parsed.contract !== VOCABULARY.contract) fail("CONTRACT");
    if (parsed.version !== VOCABULARY.version) fail("VERSION");
    if (parsed.operation !== VOCABULARY.operation) fail("OPERATION");
    if (parsed.omitted_sections?.join(",") !== VOCABULARY.omittedSections.join(",")) fail("OMITTED_SECTIONS");
    const ext = parsed.data?.external_gates;
    if (ext?.class !== "UNKNOWN" || ext?.unknown_reason !== "NOT_TRACKED_BY_DVCC") fail("EXTERNAL_GATES");
    if (!withinWindow(parsed.generated_at, exp.windows?.copy)) fail("GENERATED_AT_WINDOW");

    const project = parsed.data?.project;
    if (project?.project_id !== exp.projectId) fail("PROJECT_ID");
    const repo = project?.repository;
    if (exp.repository) {
      const v = repo?.value;
      if (repo?.class !== "HUMAN_CONFIRMED" || v?.host !== "github.com" || v?.owner !== exp.repository.owner || v?.name !== exp.repository.name) fail("REPOSITORY_IDENTITY");
    } else if (repo?.class !== "UNKNOWN") fail("REPOSITORY_ABSENT");
    if (project?.local_root?.value !== exp.localRootConfigured) fail("LOCAL_ROOT_PRESENCE");
    if (recordedTimes(project).length > 0) fail("SOURCE_BOUND_TIMESTAMP");

    // Identity: every projected review belongs to the selected project, and every EvidenceRef is one
    // the selected source can produce.
    const reviews = Array.isArray(parsed.data?.reviews) ? parsed.data.reviews : [];
    for (const id of project?.review_session_ids ?? []) if (!exp.binding.reviews.has(id)) fail("FOREIGN_REVIEW_ID");
    for (const r of reviews) {
      if (!exp.binding.reviews.has(r?.review_session_id)) fail("FOREIGN_REVIEW_ID");
      if (r?.project_id !== exp.projectId) fail("FOREIGN_PROJECT_ID");
    }
    for (const ref of evidenceRefs(parsed)) if (!exp.binding.refs.has(ref)) fail("FOREIGN_EVIDENCE_REF");

    // Recorded heads and timestamps come from the review's own rounds.
    for (const r of reviews) {
      const source = exp.binding.reviews.get(r?.review_session_id);
      if (!source) continue;
      const times = new Set(source.rounds.flatMap((x) => [x?.resultCapturedAt, x?.verdictConfirmedAt, x?.judgmentCapturedAt]).filter(nonEmpty));
      for (const t of recordedTimes(r)) if (!times.has(t)) fail("SOURCE_BOUND_TIMESTAMP");
      for (const round of Array.isArray(r.rounds) ? r.rounds : []) {
        const src = source.rounds[(round?.round ?? 0) - 1];
        if (round?.expected_head?.class === "HUMAN_CONFIRMED" && round.expected_head.value !== src?.expectedHead) fail("SOURCE_BOUND_HEAD");
        if (round?.reviewed_head?.class === "HUMAN_CONFIRMED" && round.reviewed_head.value !== src?.reviewedHead) fail("SOURCE_BOUND_HEAD");
      }
    }

    const review = reviews.find((r) => r?.review_session_id === exp.reviewId);
    if (!review || !(project?.review_session_ids ?? []).includes(exp.reviewId)) fail("REVIEW_PRESENT");
    else {
      if (review.review_state?.class !== "HUMAN_CONFIRMED" || review.review_state?.value !== exp.reviewState) fail("REVIEW_STATE");
      if (review.resource_state?.class !== "HUMAN_CONFIRMED" || review.resource_state?.value !== exp.resourceState) fail("RESOURCE_STATE");
      if (exp.prNumber === null) {
        if (review.pr_number?.class !== "UNKNOWN") fail("PR_NUMBER_ABSENT");
      } else if (review.pr_number?.class !== "HUMAN_CONFIRMED" || review.pr_number?.value !== exp.prNumber) fail("PR_NUMBER");
    }

    // Git: DVCC's own observation (as its UI rendered it) is the only expectation source.
    const git = project?.git ?? {};
    const freshness = review?.freshness;
    const ui = interpretGitUi(exp.gitUi);
    if (exp.gitRefreshCompleted && ui.statusOk && ui.head !== null) {
      const at = git.head?.observed_at;
      for (const key of ["head", "dirty", "detached"]) {
        const f = git[key];
        if (f?.class !== "OBSERVED" || f.observed_at !== at) fail(`GIT_${key.toUpperCase()}_OBSERVED`);
        else if (f.evidence_ref !== `dvcc:git-observation/${exp.projectId}/${at}`) fail(`GIT_${key.toUpperCase()}_EVIDENCE_REF`);
      }
      if (!withinWindow(at, exp.windows?.refresh)) fail("OBSERVED_AT_WINDOW");
      if (git.head?.value !== ui.head) fail("GIT_HEAD_VALUE");
      if (ui.detached !== null && git.detached?.value !== ui.detached) fail("GIT_DETACHED_VALUE");
      if (!["DERIVED", "UNKNOWN"].includes(freshness?.class)) fail("FRESHNESS");
      if (freshness?.class === "DERIVED" && freshness.basis_observed_at !== at) fail("FRESHNESS_BASIS");
    } else if (exp.gitRefreshCompleted) {
      if (git.head?.class !== "UNKNOWN" || git.head?.unknown_reason === "NOT_OBSERVED") fail("GIT_HEAD_AFTER_REFRESH");
    } else {
      if (git.head?.class !== "UNKNOWN" || !["NOT_OBSERVED", "NO_LOCAL_ROOT"].includes(git.head?.unknown_reason)) fail("GIT_HEAD_UNOBSERVED");
      if (freshness?.class !== "UNKNOWN") fail("FRESHNESS_UNOBSERVED");
    }
  } catch {
    fail("EXPECTATION_EXCEPTION");
  }
  return { pass: failures.size === 0, failures: [...failures] };
}

// ---------------------------------------------------------------------------------------------
// Local sources (read-only; the DVCC data folder only)
// ---------------------------------------------------------------------------------------------

function readText(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}

function readJson(file) {
  const text = readText(file);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch {
    return undefined;
  }
}

function listDir(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

const nullableString = (v) => v === null || typeof v === "string";

/** Approximates the app's project schema (the whole registry fails when one project does). */
function readableRegistry(data) {
  if (!isObj(data) || data.schemaVersion !== 1 || !Array.isArray(data.projects)) return null;
  const ids = new Set();
  for (const p of data.projects) {
    if (!isObj(p) || typeof p.projectId !== "string" || !PROJECT_ID.test(p.projectId) || ids.has(p.projectId)) return null;
    if (!nonEmpty(p.displayName) || !nullableString(p.repositoryUrl) || !nullableString(p.localRoot) || !nullableString(p.developmentIde ?? null)) return null;
    if (typeof p.nextAction !== "string" || typeof p.notes !== "string" || !iso(p.createdAt) || !iso(p.updatedAt)) return null;
    ids.add(p.projectId);
  }
  return data.projects;
}

/** Approximates the app's session schema. */
function readableSession(data, id) {
  if (!isObj(data) || data.schemaVersion !== 1 || data.reviewSessionId !== id || !REVIEW_ID.test(id)) return null;
  if (typeof data.projectId !== "string" || !PROJECT_ID.test(data.projectId)) return null;
  if (!(data.prNumber === null || isInt(data.prNumber, 1)) || !nonEmpty(data.reviewType)) return null;
  if (!VOCABULARY.resourceStates.includes(data.resourceState) || !VOCABULARY.reviewStates.includes(data.reviewState)) return null;
  if (!Array.isArray(data.rounds) || data.rounds.length === 0 || data.reviewRound !== data.rounds.length) return null;
  if (!data.rounds.every((r, i) => isObj(r) && r.round === i + 1 && (r.verdict === null || VOCABULARY.verdicts.includes(r.verdict)))) return null;
  if (typeof data.nextAction !== "string" || !nullableString(data.chatgptThreadUrl ?? null) || !iso(data.createdAt) || !iso(data.updatedAt)) return null;
  return data;
}

/** The primary file when readable, else its `.bak` (as the app recovers), plus every copy's JSON. */
function primaryOrBackup(dir, name, readable) {
  const copies = listDir(dir)
    .filter((f) => f === name || f.startsWith(`${name}.`))
    .map((f) => readJson(path.join(dir, f)))
    .filter((v) => v !== undefined);
  const primary = readable(readJson(path.join(dir, name)));
  const effective = primary ?? readable(readJson(path.join(dir, `${name}.bak`)));
  return { effective, copies };
}

/** Loads the data folder read-only. `projects` is undefined when the registry cannot be read. */
export function loadDataFolder(dataDir) {
  const registry = primaryOrBackup(dataDir, "projects.json", readableRegistry);
  const allProjects = registry.copies.flatMap((c) => (isObj(c) && Array.isArray(c.projects) ? c.projects.filter(isObj) : []));
  const reviews = [];
  const allSessions = [];
  const reviewsDir = path.join(dataDir, "reviews");
  for (const id of existsSync(reviewsDir) ? listDir(reviewsDir) : []) {
    const dir = path.join(reviewsDir, id);
    const session = primaryOrBackup(dir, "session.json", (data) => readableSession(data, id));
    allSessions.push(...session.copies.filter(isObj));
    reviews.push({ id, dir, session: session.effective });
  }
  const settings = readJson(path.join(dataDir, "settings.json"));
  return { projects: registry.effective ?? undefined, allProjects, reviews, allSessions, settings: isObj(settings) ? settings : {} };
}

/** Every non-empty line of a body (short lines are compared by equality, long ones as substrings). */
function bodyValues(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t !== "") out.push(t);
  }
  return out;
}

/** Markdown bodies, event notes and set-aside file names of one review folder. */
function reviewFolderValues(dir) {
  const out = { bodies: [], notes: [], setAside: [] };
  for (const name of listDir(dir)) {
    if (name.includes(".corrupt-")) out.setAside.push(name);
    if (name.endsWith(".md")) {
      const text = readText(path.join(dir, name));
      if (text !== undefined) out.bodies.push(text);
    }
    if (name.startsWith("events.jsonl")) {
      for (const line of (readText(path.join(dir, name)) ?? "").split(/\r?\n/)) {
        try {
          const event = JSON.parse(line);
          if (nonEmpty(event?.note)) out.notes.push(event.note);
        } catch {
          // a skipped line has nothing to compare
        }
      }
    }
  }
  return out;
}

/** Forbidden values from the WHOLE data folder (any project / review could leak), by category. */
export function forbiddenValues(dataDir, folder, branch) {
  const out = { absolute_path: [dataDir, os.homedir()], free_text: [], thread_pointer: [], git_branch: [], provider_identifier: [] };
  for (const v of [process.env.APPDATA, process.env.LOCALAPPDATA, process.env.TEMP, folder.settings.codexExecutablePath]) if (nonEmpty(v)) out.absolute_path.push(v);
  for (const p of folder.allProjects) {
    if (nonEmpty(p.localRoot)) out.absolute_path.push(p.localRoot);
    for (const key of ["displayName", "notes", "nextAction", "developmentIde"]) if (nonEmpty(p[key])) out.free_text.push(p[key]);
  }
  for (const s of folder.allSessions) {
    for (const key of ["reviewType", "nextAction"]) if (nonEmpty(s[key])) out.free_text.push(s[key]);
    for (const key of ["chatgptThreadTitle", "chatgptThreadUrl"]) if (nonEmpty(s[key])) out.thread_pointer.push(s[key]);
    for (const round of Array.isArray(s.rounds) ? s.rounds : []) {
      if (nonEmpty(round?.verdictNote)) out.free_text.push(round.verdictNote);
      if (nonEmpty(round?.revalidation?.explanation)) out.free_text.push(round.revalidation.explanation);
    }
  }
  for (const review of folder.reviews) {
    const values = reviewFolderValues(review.dir);
    for (const body of values.bodies) out.free_text.push(...bodyValues(body));
    out.free_text.push(...values.notes, ...values.setAside);
  }
  for (const name of listDir(dataDir)) if (name.includes(".corrupt-")) out.free_text.push(name);
  if (nonEmpty(branch)) out.git_branch.push(branch);
  return out;
}

export const COVERAGE_CATEGORIES = Object.freeze([
  "local_root",
  "display_name",
  "notes",
  "next_action",
  "development_ide",
  "review_type",
  "thread_title",
  "thread_url",
  "verdict_note",
  "review_bodies",
  "git_branch",
]);

/** Below this many non-empty sensitive categories the sample cannot show much: INCONCLUSIVE. */
export const MIN_COVERAGE = 3;

/** `branch` is DVCC's observed branch (null before a refresh: Git is never run here). */
function coverageOf(project, review, branch) {
  const s = review.session;
  const present = {
    local_root: nonEmpty(project.localRoot),
    display_name: nonEmpty(project.displayName),
    notes: nonEmpty(project.notes),
    next_action: nonEmpty(project.nextAction) || nonEmpty(s.nextAction),
    development_ide: nonEmpty(project.developmentIde),
    review_type: nonEmpty(s.reviewType),
    thread_title: nonEmpty(s.chatgptThreadTitle),
    thread_url: nonEmpty(s.chatgptThreadUrl),
    verdict_note: s.rounds.some((round) => nonEmpty(round?.verdictNote)),
    review_bodies: reviewFolderValues(review.dir).bodies.some(nonEmpty),
    git_branch: nonEmpty(branch),
  };
  return COVERAGE_CATEGORIES.filter((c) => present[c]).length;
}

// ---------------------------------------------------------------------------------------------
// Deterministic sample selection (no Git, no access to any local root)
// ---------------------------------------------------------------------------------------------

/**
 * One readable, non-CLOSED review of a registered project, preferring a configured local root (a
 * refresh can be asked of DVCC), a configured repository and the broadest sensitive-source coverage.
 * Ties break on SHA-256 of the review id. The salt is random per run, so `sampleRef` links to nothing.
 */
export function selectSample(dataDir, salt = randomBytes(32)) {
  const folder = loadDataFolder(dataDir);
  if (!folder.projects) return { status: "REGISTRY_UNREADABLE" };
  const candidates = [];
  for (const review of folder.reviews) {
    const s = review.session;
    if (!s || s.reviewState === "CLOSED") continue;
    const project = folder.projects.find((p) => p.projectId === s.projectId);
    if (!project) continue;
    const coverage = coverageOf(project, review, null);
    const score = (nonEmpty(project.localRoot) ? 2 : 0) + (nonEmpty(project.repositoryUrl) ? 2 : 0) + coverage;
    const order = createHash("sha256").update(review.id).digest("hex");
    candidates.push({ review, project, coverage, score, order });
  }
  if (candidates.length === 0) return { status: "NO_CANDIDATE" };
  candidates.sort((a, b) => b.score - a.score || (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
  const chosen = candidates[0];
  return {
    status: "SELECTED",
    reviewId: chosen.review.id,
    projectId: chosen.project.projectId,
    hasLocalRoot: nonEmpty(chosen.project.localRoot),
    sampleRef: `sha256:${createHash("sha256").update(salt).update(chosen.review.id).digest("hex").slice(0, 16)}`,
    coverage: chosen.coverage,
    coverageTotal: COVERAGE_CATEGORIES.length,
  };
}

// ---------------------------------------------------------------------------------------------
// Audit of one captured snapshot
// ---------------------------------------------------------------------------------------------

export function auditSnapshot({ dataDir, projectId, reviewId, snapshotText, gitRefreshCompleted, gitUi, windows }) {
  const folder = loadDataFolder(dataDir);
  if (!folder.projects) return { status: "REGISTRY_UNREADABLE" };
  const project = folder.projects.find((p) => p.projectId === projectId);
  const review = folder.reviews.find((r) => r.id === reviewId && r.session !== null);
  if (!project || !review) return { status: "SAMPLE_UNAVAILABLE" };
  const git = interpretGitUi(gitRefreshCompleted === true ? gitUi : null);
  const coverage = coverageOf(project, review, git.branch);

  let parsed;
  try {
    parsed = JSON.parse(snapshotText);
  } catch {
    return { status: "AUDITED", contractParse: "FAIL", coverage };
  }
  if (!isObj(parsed)) return { status: "AUDITED", contractParse: "FAIL", coverage };

  const allow = validateSnapshot(parsed);
  const binding = sourceBinding(folder, project, parsed, windows, git.statusOk ? gitUi : null);
  const forbidden = forbiddenValues(dataDir, folder, git.branch);
  const exact = exactLeaks(parsed, forbidden, binding.legit);
  const patterns = patternHits(parsed);
  const s = review.session;
  const facts = expectedFacts(parsed, {
    projectId,
    reviewId,
    repository: repositoryIdentity(project.repositoryUrl),
    localRootConfigured: nonEmpty(project.localRoot),
    reviewState: s.reviewState,
    resourceState: s.resourceState,
    prNumber: Number.isInteger(s.prNumber) ? s.prNumber : null,
    binding,
    windows,
    gitRefreshCompleted: gitRefreshCompleted === true,
    gitUi,
  });
  return {
    status: "AUDITED",
    contractParse: "PASS",
    allowlistDecided: allow.decided,
    allowlist: allow.unknownFields === 0 && allow.violations === 0 && allow.decided ? "PASS" : "FAIL",
    unknownFieldCount: allow.unknownFields,
    coverage,
    detectorsLive: detectorsLive(parsed, forbidden, binding.legit),
    overlapsExcluded: exact.overlapsResolved + exact.overlapsUnresolved,
    overlapsUnresolved: exact.overlapsUnresolved,
    exactSensitiveValueLeaks: EXACT_CATEGORIES.reduce((sum, c) => sum + exact[c], 0),
    absolutePathLeaks: exact.absolute_path + patterns.absolute_path,
    gitBranchLeaks: exact.git_branch,
    freeTextLeaks: exact.free_text,
    threadPointerLeaks: exact.thread_pointer + patterns.thread_pointer,
    providerIdentifierLeaks: exact.provider_identifier + patterns.provider_identifier,
    credentialPatternHits: patterns.credential,
    expectedMachineFacts: facts.pass ? "PASS" : "FAIL",
  };
}

// ---------------------------------------------------------------------------------------------
// Decision and report
// ---------------------------------------------------------------------------------------------

/**
 * A finding FAILs; anything the run could not establish safely is INCONCLUSIVE (fail-closed); a
 * precondition refusal is BLOCKED. A FAIL finding outranks INCONCLUSIVE: it is a fact either way.
 */
export function decide(m) {
  if (m.blockedCode) return { result: "BLOCKED", reason: m.blockedCode };
  const a = m.audit && m.audit.status === "AUDITED" ? m.audit : null;
  const fails = [];
  if (a && a.contractParse === "PASS") {
    if (a.allowlistDecided && a.allowlist === "FAIL") fails.push("ALLOWLIST");
    if (a.exactSensitiveValueLeaks > 0) fails.push("EXACT_SENSITIVE_VALUE_LEAK");
    if (a.absolutePathLeaks > 0) fails.push("ABSOLUTE_PATH_LEAK");
    if (a.gitBranchLeaks > 0) fails.push("GIT_BRANCH_LEAK");
    if (a.freeTextLeaks > 0) fails.push("FREE_TEXT_LEAK");
    if (a.threadPointerLeaks > 0) fails.push("THREAD_POINTER_LEAK");
    if (a.providerIdentifierLeaks > 0) fails.push("PROVIDER_IDENTIFIER_LEAK");
    if (a.credentialPatternHits > 0) fails.push("CREDENTIAL_PATTERN_HIT");
    if (a.expectedMachineFacts === "FAIL") fails.push("EXPECTED_MACHINE_FACTS");
  }
  if (m.writeDuringCopy === true) fails.push("PERSISTENT_WRITE_DURING_COPY");
  if (m.writeOutsideCopy === true) fails.push("PERSISTENT_WRITE_OUTSIDE_COPY");
  if (m.stateChange === "YES") fails.push("STATE_CHANGE");
  if (fails.length > 0) return { result: "FAIL", reason: fails[0] };

  const inconclusive = (reason) => ({ result: "INCONCLUSIVE", reason });
  if (m.stopCode) return inconclusive(m.stopCode);
  if (m.audit && m.audit.status !== "AUDITED") return inconclusive(m.audit.status);
  if (!a) return inconclusive("NOT_AUDITED");
  if (a.contractParse !== "PASS") return inconclusive("JSON_PARSE_FAILED");
  if (!a.allowlistDecided) return inconclusive("ALLOWLIST_UNDECIDABLE");
  if (!(a.overlapsUnresolved === 0)) return inconclusive("EXACT_COMPARISON_OVERLAP");
  if (!a.detectorsLive) return inconclusive("DETECTORS_NOT_LIVE");
  if (m.copyActions !== 1) return inconclusive("COPY_ACTION_COUNT");
  if (m.clipboardSequenceChanged !== false) return inconclusive("OS_CLIPBOARD_NOT_PROVEN_UNTOUCHED");
  if (m.writeDuringCopy !== false || m.writeOutsideCopy !== false) return inconclusive("WRITE_CHECK_INCOMPLETE");
  if (m.stateChange !== "NO") return inconclusive("STATE_CHECK_INCOMPLETE");
  if (!(a.coverage >= MIN_COVERAGE)) return inconclusive("LOW_COVERAGE");
  return { result: "PASS", reason: "ALL_CHECKS_PASSED" };
}

const COUNT = /^(0|[1-9]\d{0,6}|NOT_RUN)$/;
export const REPORT_SCHEMA = Object.freeze([
  ["reviewed_head", /^[0-9a-f]{40}$/],
  ["harness_head", /^[0-9a-f]{40}$/],
  ["sample_ref", /^(sha256:[0-9a-f]{16}|NOT_SELECTED)$/],
  ["selection", /^automatic$/],
  ["copy_actions", /^[01]$/],
  ["contract_parse", /^(PASS|FAIL|NOT_RUN)$/],
  ["allowlist", /^(PASS|FAIL|NOT_RUN)$/],
  ["unknown_field_count", COUNT],
  ["sensitive_source_categories_present", /^(\d{1,2}\/\d{1,2}|NOT_RUN)$/],
  ["exact_sensitive_value_leaks", COUNT],
  ["absolute_path_leaks", COUNT],
  ["git_branch_leaks", COUNT],
  ["free_text_leaks", COUNT],
  ["thread_pointer_leaks", COUNT],
  ["provider_identifier_leaks", COUNT],
  ["credential_pattern_hits", COUNT],
  ["exact_comparison_overlaps_excluded", COUNT],
  ["expected_machine_facts", /^(PASS|FAIL|NOT_RUN)$/],
  ["unexpected_state_change", /^(YES|NO|UNKNOWN)$/],
  ["unexpected_persistent_write", /^(YES|NO|UNKNOWN)$/],
  ["raw_snapshot_persisted", /^NO$/],
  ["raw_values_logged", /^NO$/],
  ["os_clipboard_received_raw_snapshot", /^(NO|UNKNOWN)$/],
  ["result", /^(PASS|FAIL|INCONCLUSIVE|BLOCKED)$/],
  ["result_reason", /^[A-Z][A-Z0-9_]{2,63}$/],
]);

export function reportFields(m, verdict) {
  const a = m.audit && m.audit.status === "AUDITED" ? m.audit : null;
  const parsedOk = a !== null && a.contractParse === "PASS";
  const n = (v) => (parsedOk && Number.isInteger(v) ? String(v) : "NOT_RUN");
  const coverage = a ? a.coverage : m.coverage;
  const writes =
    m.writeDuringCopy === true || m.writeOutsideCopy === true ? "YES" : m.writeDuringCopy === false && m.writeOutsideCopy === false ? "NO" : "UNKNOWN";
  return {
    reviewed_head: String(m.reviewedHead),
    harness_head: String(m.harnessHead),
    sample_ref: m.sampleRef ?? "NOT_SELECTED",
    selection: "automatic",
    copy_actions: String(m.copyActions ?? 0),
    contract_parse: a ? a.contractParse : "NOT_RUN",
    allowlist: parsedOk ? a.allowlist : "NOT_RUN",
    unknown_field_count: n(a?.unknownFieldCount),
    sensitive_source_categories_present: Number.isInteger(coverage) ? `${coverage}/${COVERAGE_CATEGORIES.length}` : "NOT_RUN",
    exact_sensitive_value_leaks: n(a?.exactSensitiveValueLeaks),
    absolute_path_leaks: n(a?.absolutePathLeaks),
    git_branch_leaks: n(a?.gitBranchLeaks),
    free_text_leaks: n(a?.freeTextLeaks),
    thread_pointer_leaks: n(a?.threadPointerLeaks),
    provider_identifier_leaks: n(a?.providerIdentifierLeaks),
    credential_pattern_hits: n(a?.credentialPatternHits),
    exact_comparison_overlaps_excluded: n(a?.overlapsExcluded),
    expected_machine_facts: parsedOk ? a.expectedMachineFacts : "NOT_RUN",
    unexpected_state_change: m.stateChange === "YES" || m.stateChange === "NO" ? m.stateChange : "UNKNOWN",
    unexpected_persistent_write: writes,
    raw_snapshot_persisted: "NO",
    raw_values_logged: "NO",
    os_clipboard_received_raw_snapshot: m.clipboardSequenceChanged === false ? "NO" : "UNKNOWN",
    result: verdict.result,
    result_reason: verdict.reason,
  };
}

/** Renders the report; throws when any value is outside its declared domain. */
export function renderReport(fields, selfTest) {
  const lines = [];
  for (const [key, domain] of REPORT_SCHEMA) {
    const value = fields[key];
    if (typeof value !== "string" || !domain.test(value)) throw new Error("REPORT_RENDER_FAILED");
    lines.push(`${key}: ${value}`);
  }
  if (Object.keys(fields).some((key) => !REPORT_SCHEMA.some(([k]) => k === key))) throw new Error("REPORT_RENDER_FAILED");
  const title = selfTest ? "G4 Real-Data Disclosure Audit - SELF-TEST (synthetic data only)" : "G4 Real-Data Disclosure Audit - LR-20261005-DVCC-011";
  return [
    `# ${title}`,
    "",
    "Generated by `scripts/verify-control-read-real-data-audit.ps1` (HD-5A-10). Sanitized: fixed codes,",
    "counts, DVCC repository commit SHAs and an opaque per-run sample reference only. No raw snapshot,",
    "path, identifier, free text or provider value is recorded.",
    "",
    "```text",
    ...lines,
    "```",
    "",
  ].join("\n");
}

/** Audit (when a snapshot was captured), decision and report in one step. */
export function finalize(req) {
  const m = { ...req, audit: null };
  if (!m.blockedCode && typeof req.snapshotText === "string") {
    m.audit = auditSnapshot({
      dataDir: String(req.dataDir),
      projectId: String(req.projectId),
      reviewId: String(req.reviewId),
      snapshotText: req.snapshotText,
      gitRefreshCompleted: req.gitRefreshCompleted === true,
      gitUi: req.gitUi ?? null,
      windows: req.windows ?? null,
    });
  }
  delete m.snapshotText;
  const verdict = decide(m);
  try {
    // Self-test only: proves the harness's finalization boundary handles a renderer failure.
    if (req.selfTest === true && req.selfTestFault === "RENDER") throw new Error("REPORT_RENDER_FAILED");
    return { status: "FINALIZED", result: verdict.result, reason: verdict.reason, reportText: renderReport(reportFields(m, verdict), req.selfTest === true) };
  } catch {
    return { status: "FINALIZED", result: "INCONCLUSIVE", reason: "REPORT_RENDER_FAILED", reportText: null };
  }
}

// ---------------------------------------------------------------------------------------------
// CLI: one JSON request on stdin -> one JSON line on stdout. Never an error text.
// ---------------------------------------------------------------------------------------------

export async function runCli(input) {
  try {
    // .NET's redirected stdin writer may emit a UTF-8 preamble before the request.
    const request = JSON.parse(input.replace(/^\uFEFF/, ""));
    if (request.op === "select") return selectSample(String(request.dataDir));
    if (request.op === "finalize") return finalize(request);
    return { status: "UNKNOWN_OP" };
  } catch {
    return { status: "AUDIT_EXCEPTION" };
  }
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const output = await runCli(Buffer.concat(chunks).toString("utf8"));
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked !== "" && invoked.toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  await main();
}
