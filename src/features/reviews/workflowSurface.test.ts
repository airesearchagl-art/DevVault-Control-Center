import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { deriveFreshness, type Freshness, type FreshnessResult } from "../../domain/freshness";
import type { GitObservation } from "../../domain/git";
import type { Project } from "../../domain/project";
import { createReviewSession, emptyReviewForm, type ReviewSession } from "../../domain/review";
import { applyReviewAction, type ReviewAction } from "../../domain/transitions";
import { createTranslator, EVIDENCE_STATUS_KEYS, FRESHNESS_KEYS, type Locale } from "../../i18n";
import { I18nContext } from "../../i18n/context";
import { RiskTierDialog } from "./ReviewDialogs";
import { ReviewDetail } from "./ReviewDetail";
import { ReviewFreshness } from "./ReviewFreshness";
import { ReviewWorkflow } from "./ReviewWorkflow";

/**
 * The Phase 3 surface, rendered to markup in both languages.
 *
 * What is checked is what a Human (or a screen reader) actually gets: every Freshness status with its
 * reason, an UNKNOWN that never reads as aligned, a Freshness that changes nothing else on the page,
 * and refused controls that say why and what to do next.
 */

const NOW = "2026-01-01T00:00:00.000Z";
const FULL = "0123456789abcdef0123456789abcdef01234567";
const OTHER = "fedcba9876543210fedcba9876543210fedcba98";
const LOCALES: readonly Locale[] = ["ja", "en"];

const project: Project = {
  projectId: "project-alpha",
  displayName: "Project Alpha",
  repositoryUrl: "https://github.com/example-org/project-alpha",
  localRoot: "C:\\example\\alpha",
  developmentIde: null,
  nextAction: "",
  notes: "",
  createdAt: NOW,
  updatedAt: NOW,
};

function apply(session: ReviewSession, actions: readonly ReviewAction[]): ReviewSession {
  let current = session;
  for (const action of actions) {
    const out = applyReviewAction(current, action, NOW);
    if (!out.ok) throw new Error(`${action.type}: ${JSON.stringify(out.error)}`);
    current = out.value.session;
  }
  return current;
}

function reviewing(expectedHead = FULL): ReviewSession {
  const created = createReviewSession(
    { ...emptyReviewForm("project-alpha"), prNumber: "45", expectedHead },
    new Set(["project-alpha"]),
    "rv-20260101-alpha1",
    NOW,
  );
  if (!created.ok) throw new Error(JSON.stringify(created.error));
  return apply(created.value.session, [{ type: "markReady" }, { type: "startReview" }, { type: "recordRequestSaved" }]);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

function render(locale: Locale, element: ReactElement): string {
  return renderToStaticMarkup(
    createElement(I18nContext.Provider, { value: { locale, t: createTranslator(locale), setLocale: () => undefined } }, element),
  );
}

function observation(head: string | null, dirty: boolean | null = false, status: GitObservation["status"] = "OK"): GitObservation {
  return { status, head, branch: "main", detached: false, dirty, observedAt: "2026-01-02T03:04:05.000Z" };
}

/** One Freshness result per status, each from the Phase 2 function with the inputs that produce it. */
const FIVE: Record<Freshness, { freshness: FreshnessResult; observation: GitObservation | undefined }> = {
  ALIGNED: { observation: observation(FULL), freshness: deriveFreshness({ observation: observation(FULL), expectedHead: FULL, reviewedHead: null }) },
  HEAD_CHANGED: {
    observation: observation(OTHER),
    freshness: deriveFreshness({ observation: observation(OTHER), expectedHead: FULL, reviewedHead: null }),
  },
  REVIEW_STALE: {
    observation: observation(OTHER),
    freshness: deriveFreshness({ observation: observation(OTHER), expectedHead: FULL, reviewedHead: FULL }),
  },
  WORKTREE_DIRTY: {
    observation: observation(FULL, true),
    freshness: deriveFreshness({ observation: observation(FULL, true), expectedHead: FULL, reviewedHead: null }),
  },
  UNKNOWN: { observation: undefined, freshness: deriveFreshness({ observation: undefined, expectedHead: FULL, reviewedHead: null }) },
};

function freshnessCard(locale: Locale, status: Freshness): string {
  const { freshness, observation: observed } = FIVE[status];
  return render(locale, createElement(ReviewFreshness, { freshness, observation: observed, busy: false, onRefreshGit: () => undefined }));
}

function detail(locale: Locale, session: ReviewSession, freshness: FreshnessResult, observed: GitObservation | undefined, onAction = () => undefined) {
  return render(
    locale,
    createElement(ReviewDetail, {
      session,
      project,
      artifacts: undefined,
      busy: false,
      observation: observed,
      freshness,
      onRefreshGit: () => undefined,
      onAction,
      onOpenDialog: () => undefined,
      onOpenGithub: () => undefined,
      onOpenChatgpt: () => undefined,
      onOpenFolder: () => undefined,
      onCopyPrompt: () => undefined,
      onCopyFollowup: () => undefined,
      priorReviews: [],
      onRecordEvidence: () => undefined,
      onSaveNextAction: async () => true,
    }),
  );
}

function detailWithPrior(locale: Locale, session: ReviewSession, priorHead: string) {
  return render(
    locale,
    createElement(ReviewDetail, {
      session,
      project,
      artifacts: undefined,
      busy: false,
      observation: undefined,
      freshness: FIVE.UNKNOWN.freshness,
      onRefreshGit: () => undefined,
      onAction: () => undefined,
      onOpenDialog: () => undefined,
      onOpenGithub: () => undefined,
      onOpenChatgpt: () => undefined,
      onOpenFolder: () => undefined,
      onCopyPrompt: () => undefined,
      onCopyFollowup: () => undefined,
      priorReviews: [{ reviewId: "rv-20251201-other1", round: 1, projectId: "project-alpha", reviewedHead: priorHead, substantive: true }],
      onRecordEvidence: () => undefined,
      onSaveNextAction: async () => true,
    }),
  );
}

/** Every `data-state` / `data-evidence-status` value outside the Freshness card, in document order. */
function statesOutsideFreshness(markup: string): string[] {
  const withoutCard = markup.replace(/<section[^>]*data-testid="workflow-freshness"[\s\S]*?<\/section>/, "");
  const withoutGitCard = withoutCard.replace(/<section[^>]*data-testid="git-evidence"[\s\S]*?<\/section>/, "");
  return [...withoutGitCard.matchAll(/data-(?:state|evidence-status|cause)="([^"]*)"/g)].map((match) => match[1]);
}

/** The attributes of the element carrying `data-testid`. */
function element(markup: string, testId: string): string {
  const match = new RegExp(`<[a-z]+[^>]*data-testid="${testId}"[^>]*>`).exec(markup);
  if (!match) throw new Error(`no element ${testId}`);
  return match[0];
}

function textOfId(markup: string, id: string): string {
  const match = new RegExp(`id="${id.replace(/[:«»]/g, (c) => `\\${c}`)}"[^>]*>([^<]*)<`).exec(markup);
  if (!match) throw new Error(`no element with id ${id}`);
  return decode(match[1]);
}

/** Markup escapes quotes and ampersands; the Human reads them as written. */
function decode(text: string): string {
  return text.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

// --- Freshness -----------------------------------------------------------------------------------

describe("Freshness in the workflow", () => {
  for (const locale of LOCALES) {
    const t = createTranslator(locale);
    it.each(Object.keys(FIVE) as Freshness[])(`%s is shown with its label and its reason (${locale})`, (status) => {
      const markup = freshnessCard(locale, status);
      expect(markup).toContain(`data-state="${status}"`);
      expect(markup).toContain(`>${t(FRESHNESS_KEYS[status])}<`);
      const reason = /data-testid="workflow-freshness-reason">([^<]+)</.exec(markup);
      expect(reason?.[1].trim()).toBeTruthy();
      // The heads it compared and when it looked, or an explicit "not observed" — never a guess.
      expect(markup).toContain('data-testid="workflow-freshness-expected"');
      expect(markup).toContain('data-testid="workflow-freshness-current"');
      expect(markup).toContain('data-testid="workflow-freshness-observed-at"');
    });

    it(`UNKNOWN is never shown as ALIGNED, and says which kind of unknown it is (${locale})`, () => {
      const markup = freshnessCard(locale, "UNKNOWN");
      expect(markup).not.toContain('data-state="ALIGNED"');
      expect(markup).not.toContain(`>${t(FRESHNESS_KEYS.ALIGNED)}<`);
      expect(markup).toContain('data-cause="NOT_OBSERVED"');
      expect(markup).toContain('data-testid="workflow-freshness-next"');
      expect(markup).toContain(t("git.refresh"));
    });
  }

  it.each([
    ["Git unavailable", observation(null, null, "GIT_UNAVAILABLE"), "GIT_UNAVAILABLE"],
    ["no local root", observation(null, null, "NO_LOCAL_ROOT"), "NO_LOCAL_ROOT"],
    ["head not comparable", observation(null), "HEAD_NOT_COMPARABLE"],
  ] as const)("UNKNOWN because of %s", (_name, observed, cause) => {
    const freshness = deriveFreshness({ observation: observed, expectedHead: FULL, reviewedHead: null });
    expect(freshness.status).toBe("UNKNOWN");
    const markup = render("en", createElement(ReviewFreshness, { freshness, observation: observed, busy: false, onRefreshGit: () => undefined }));
    expect(markup).toContain(`data-cause="${cause}"`);
  });

  it("REVIEW_STALE shows the recorded and the observed heads", () => {
    const markup = freshnessCard("en", "REVIEW_STALE");
    expect(markup).toContain(FULL);
    expect(markup).toContain(OTHER);
  });

  it("the Freshness status changes nothing else on the page, and writes nothing", () => {
    const session = deepFreeze(reviewing());
    const before = JSON.stringify(session);
    const calls: unknown[] = [];
    const fixedObservation = observation(FULL);
    for (const locale of LOCALES) {
      const baseline = statesOutsideFreshness(detail(locale, session, FIVE.ALIGNED.freshness, fixedObservation));
      expect(baseline).toContain("REVIEWING");
      for (const status of Object.keys(FIVE) as Freshness[]) {
        const markup = detail(locale, session, FIVE[status].freshness, fixedObservation, (...args: unknown[]) => void calls.push(args));
        expect(statesOutsideFreshness(markup), status).toEqual(baseline);
        expect(element(markup, "detail-review-state")).toContain('data-state="REVIEWING"');
      }
    }
    expect(calls).toEqual([]);
    expect(JSON.stringify(session)).toBe(before);
  });

  it("a locale switch changes no state and no data", () => {
    const session = deepFreeze(reviewing());
    const before = JSON.stringify(session);
    for (const status of Object.keys(FIVE) as Freshness[]) {
      const [ja, en] = LOCALES.map((locale) => detail(locale, session, FIVE[status].freshness, FIVE[status].observation));
      const states = (markup: string) => [...markup.matchAll(/data-(?:state|evidence-status|cause)="([^"]*)"/g)].map((match) => match[1]);
      expect(states(ja)).toEqual(states(en));
    }
    expect(JSON.stringify(session)).toBe(before);
  });
});

// --- accessibility and refusals ------------------------------------------------------------------

/** A refused control is focusable, marked refused, and described by visible text. */
function refusedReason(markup: string, testId: string): string {
  const button = element(markup, testId);
  expect(button).toContain('aria-disabled="true"');
  expect(button).not.toMatch(/\sdisabled=""/);
  const describedBy = /aria-describedby="([^"]+)"/.exec(button);
  expect(describedBy, `${testId} has no aria-describedby`).not.toBeNull();
  const text = textOfId(markup, describedBy![1]);
  expect(text.trim().length).toBeGreaterThan(0);
  return text;
}

function workflow(locale: Locale, session: ReviewSession, observed?: GitObservation) {
  return render(
    locale,
    createElement(ReviewWorkflow, {
      session,
      round: session.rounds[session.rounds.length - 1],
      busy: false,
      projectMissing: false,
      observation: observed,
      onCopyFollowup: () => undefined,
      onCaptureJudgment: () => undefined,
      onSetRiskTier: () => undefined,
      onEditReview: () => undefined,
    }),
  );
}

describe("refused controls say why, and what to do next", () => {
  for (const locale of LOCALES) {
    const t = createTranslator(locale);

    it(`Turn 2 and the Final Judgment before the Fresh Assessment (${locale})`, () => {
      const markup = workflow(locale, reviewing());
      expect(refusedReason(markup, "action-copy-followup")).toContain(t("workflow.next.captureAssessment"));
      expect(refusedReason(markup, "action-capture-judgment")).toContain(t("workflow.next.captureAssessment"));
    });

    it(`the Final Judgment before Turn 2 (${locale})`, () => {
      const session = apply(reviewing(), [{ type: "captureResult", reviewedHead: FULL }]);
      const markup = workflow(locale, session);
      expect(element(markup, "action-copy-followup")).not.toContain("aria-disabled");
      expect(refusedReason(markup, "action-capture-judgment")).toContain(t("workflow.next.sendFollowup"));
    });

    it(`Confirm verdict while the Final Judgment is awaited (${locale})`, () => {
      const session = apply(reviewing(), [{ type: "captureResult", reviewedHead: FULL }, { type: "recordFollowupSaved" }]);
      const markup = detail(locale, session, FIVE.ALIGNED.freshness, FIVE.ALIGNED.observation);
      expect(refusedReason(markup, "action-verdict")).toContain(t("workflow.next.captureJudgment"));
    });

    it(`Confirm verdict before the Fresh Assessment (${locale})`, () => {
      const markup = detail(locale, reviewing(), FIVE.ALIGNED.freshness, FIVE.ALIGNED.observation);
      expect(refusedReason(markup, "action-verdict")).toContain(t("workflow.next.captureAssessment"));
    });

    it(`Turn 2 once the round is decided, and the Risk Tier refusal (${locale})`, () => {
      const session = apply(reviewing(), [
        { type: "captureResult", reviewedHead: FULL },
        { type: "confirmVerdict", verdict: "REVIEW_PASS", note: null, confirmedByHuman: true },
      ]);
      const markup = workflow(locale, session);
      expect(refusedReason(markup, "action-copy-followup").length).toBeGreaterThan(0);
      expect(refusedReason(markup, "action-set-risk-tier").length).toBeGreaterThan(0);
    });

    it(`no same-head duplicate: recording a reason is refused with the reason (${locale})`, () => {
      const markup = detail(locale, reviewing(), FIVE.ALIGNED.freshness, FIVE.ALIGNED.observation);
      expect(refusedReason(markup, "action-record-revalidation")).toBe(t("workflow.revalidation.notNeeded"));
    });

    it(`an undecidable duplicate says so and says what to do (${locale})`, () => {
      const markup = detailWithPrior(locale, reviewing("0123456"), "0123456");
      expect(markup).toContain('data-testid="duplicate-undecidable"');
      expect(refusedReason(markup, "action-record-revalidation")).toBe(t("workflow.revalidation.undecidable"));
    });

    it(`a same-head duplicate names the next step and keeps the reason button available (${locale})`, () => {
      const markup = detailWithPrior(locale, reviewing(FULL), FULL);
      expect(markup).toContain('data-state="DUPLICATE_BLOCKED"');
      expect(markup).toContain(t("workflow.duplicate.next"));
      expect(element(markup, "action-record-revalidation")).not.toContain("aria-disabled");
    });

    it(`a short head is not exact, and the next step is offered without writing anything (${locale})`, () => {
      const session = deepFreeze(reviewing("0123456"));
      const before = JSON.stringify(session);
      const markup = workflow(locale, session, observation(FULL));
      expect(markup).toContain('data-state="SHORT"');
      expect(markup).toContain('data-state="MATCHES"');
      expect(markup).toContain(t("workflow.head.next"));
      expect(markup).toContain('data-testid="action-edit-head"');
      expect(JSON.stringify(session)).toBe(before);
    });

    it(`a full head is exact and needs no next step (${locale})`, () => {
      const markup = workflow(locale, reviewing(FULL), observation(OTHER));
      expect(markup).toContain('data-state="EXACT"');
      expect(markup).toContain('data-state="DIFFERS"');
      expect(markup).not.toContain('data-testid="workflow-head-next"');
    });
  }
});

describe("Phase 3 controls are labelled", () => {
  const phase3Sections = ["detail-workflow", "workflow-freshness", "detail-evidence"];

  function sectionMarkup(markup: string, testId: string): string {
    const match = new RegExp(`<section[^>]*data-testid="${testId}"[\\s\\S]*?</section>`).exec(markup);
    if (!match) throw new Error(`no section ${testId}`);
    return match[0];
  }

  for (const locale of LOCALES) {
    it(`every button has a name, and none is disabled without a reason (${locale})`, () => {
      for (const session of [reviewing(), apply(reviewing(), [{ type: "captureResult", reviewedHead: FULL }])]) {
        const markup = detail(locale, session, FIVE.UNKNOWN.freshness, undefined);
        for (const testId of phase3Sections) {
          const part = sectionMarkup(markup, testId);
          for (const button of part.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)) {
            expect(button[2].trim().length, `${testId}: empty button`).toBeGreaterThan(0);
            expect(button[1], `${testId}: ${button[2]} is silently disabled`).not.toMatch(/\sdisabled=""/);
          }
        }
      }
    });

    it(`button groups, lists and dialogs carry labels (${locale})`, () => {
      const markup = detail(locale, reviewing(), FIVE.ALIGNED.freshness, FIVE.ALIGNED.observation);
      for (const group of markup.matchAll(/<div[^>]*role="group"[^>]*>/g)) expect(group[0]).toMatch(/aria-label="[^"]+"/);
      expect(sectionMarkup(markup, "workflow-freshness")).toMatch(/aria-labelledby="[^"]+"/);
      expect(sectionMarkup(markup, "detail-workflow")).toMatch(/role="status"/);

      const dialog = render(locale, createElement(RiskTierDialog, { session: reviewing(), onSubmit: async () => null, onCancel: () => undefined }));
      const labelledBy = /role="dialog"[^>]*aria-labelledby="([^"]+)"/.exec(dialog);
      expect(labelledBy).not.toBeNull();
      expect(dialog).toContain(`<h2 id="${labelledBy![1]}">`);
      expect((dialog.match(/<fieldset/g) ?? []).length).toBe(2);
      expect((dialog.match(/<legend>[^<]+<\/legend>/g) ?? []).length).toBe(2);
      // Nothing chosen yet: the save button is disabled, and the reason is tied to it.
      const submit = element(dialog, "risk-tier-submit");
      expect(submit).toMatch(/aria-describedby="[^"]+"/);
      expect(dialog).toContain(createTranslator(locale)("review.riskTier.submitDisabled"));
    });

    it(`a Risk Tier below what the subjects require is refused visibly before it is saved (${locale})`, () => {
      const base = reviewing();
      const session: ReviewSession = {
        ...base,
        rounds: [{ ...base.rounds[0], riskTier: "TIER_0", riskTierSubjects: ["SECURITY"] }],
      };
      const dialog = render(locale, createElement(RiskTierDialog, { session, onSubmit: async () => null, onCancel: () => undefined }));
      expect(dialog).toContain('data-testid="risk-tier-refusal-preview"');
      expect(dialog).toContain("TIER_2");
    });

    it(`evidence statuses are words, not only colours (${locale})`, () => {
      const t = createTranslator(locale);
      const session = apply(reviewing(), [{ type: "captureResult", reviewedHead: FULL }]);
      const markup = detail(locale, session, FIVE.ALIGNED.freshness, FIVE.ALIGNED.observation);
      const rows = [...markup.matchAll(/<li data-evidence-status="([^"]+)"><strong>([^<]+)<\/strong>/g)];
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(row[2]).toBe(t(EVIDENCE_STATUS_KEYS[row[1] as keyof typeof EVIDENCE_STATUS_KEYS]));
    });
  }

  it("the two languages expose the same accessible structure", () => {
    const shape = (markup: string) => ({
      labels: (markup.match(/aria-label=/g) ?? []).length,
      labelledBy: (markup.match(/aria-labelledby=/g) ?? []).length,
      describedBy: (markup.match(/aria-describedby=/g) ?? []).length,
      statuses: (markup.match(/role="status"/g) ?? []).length,
      refused: (markup.match(/aria-disabled="true"/g) ?? []).length,
    });
    for (const session of [reviewing(), apply(reviewing(), [{ type: "captureResult", reviewedHead: FULL }]), reviewing("0123456")]) {
      const [ja, en] = LOCALES.map((locale) => detail(locale, session, FIVE.UNKNOWN.freshness, undefined));
      expect(shape(ja)).toEqual(shape(en));
    }
  });
});
