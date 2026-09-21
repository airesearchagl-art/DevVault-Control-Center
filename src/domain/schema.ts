import { isReviewEventType, type ReviewEvent, type StateChange } from "./events";
import { message, type Message } from "./message";
import type { TranslationKey, TranslationParams } from "../i18n/types";
import type { Project } from "./project";
import { SCHEMA_VERSION, isArchivedResultFileName, type ReviewSession, type RoundRecord } from "./review";
import { MAX_REVIEW_ROUNDS } from "./limits";
import {
  isResourceState,
  isResumableState,
  isReviewState,
  isVerdict,
  type ResourceState,
  type ReviewState,
} from "./states";
import {
  isIsoTimestamp,
  isValidHead,
  isValidProjectId,
  isValidReviewId,
  normalizeChatgptThreadUrl,
  normalizeLocalRoot,
  normalizeRepositoryUrl,
} from "./validation";

/**
 * Parsing of persisted v1 files. Anything that does not match the contract is reported as
 * `malformed`; a numeric `schemaVersion` above the supported one is `unsupported_version`
 * (read-only, never overwritten). Unknown extra keys are ignored.
 */
export type ParseResult<T> =
  | { status: "ok"; value: T }
  | { status: "malformed"; reason: Message }
  | { status: "unsupported_version"; version: number };

type Obj = Record<string, unknown>;

/**
 * A parse failure names the message and the field it is about; the field path itself is an
 * identifier, so it travels as a parameter and is shown as it is in either language.
 */
class SchemaError extends Error {
  constructor(readonly reason: Message) {
    super(reason.key);
  }
}

function fail(key: TranslationKey, params?: TranslationParams): never {
  throw new SchemaError(message(key, params));
}

function isObject(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(obj: Obj, key: string, where: string): string {
  const value = obj[key];
  if (typeof value !== "string") fail("schema.field.mustBeString", { field: `${where}.${key}` });
  return value;
}

function nullableStr(obj: Obj, key: string, where: string): string | null {
  const value = obj[key];
  if (value === null) return null;
  if (typeof value !== "string") fail("schema.field.mustBeStringOrNull", { field: `${where}.${key}` });
  return value;
}

function timestamp(obj: Obj, key: string, where: string): string {
  const value = obj[key];
  if (!isIsoTimestamp(value)) fail("schema.field.mustBeTimestamp", { field: `${where}.${key}` });
  return value;
}

function nullableTimestamp(obj: Obj, key: string, where: string): string | null {
  const value = obj[key];
  if (value === null) return null;
  if (!isIsoTimestamp(value)) fail("schema.field.mustBeTimestampOrNull", { field: `${where}.${key}` });
  return value;
}

function nullableHead(obj: Obj, key: string, where: string): string | null {
  const value = obj[key];
  if (value === null) return null;
  if (!isValidHead(value)) fail("schema.field.mustBeHeadOrNull", { field: `${where}.${key}` });
  return value;
}

function positiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function parseJson(text: string): Obj {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    fail("schema.invalidJson", { reason: error instanceof Error ? error.message : String(error) });
  }
  if (!isObject(data)) fail("schema.topLevelMustBeObject");
  return data;
}

/** Returns an `unsupported_version` result when the file declares a newer schema. */
function checkVersion(data: Obj): { status: "unsupported_version"; version: number } | null {
  const version = data.schemaVersion;
  if (typeof version === "number" && Number.isInteger(version) && version > SCHEMA_VERSION) {
    return { status: "unsupported_version", version };
  }
  if (version !== SCHEMA_VERSION) fail("schema.versionMustBe", { version: SCHEMA_VERSION });
  return null;
}

function guarded<T>(parse: () => ParseResult<T>): ParseResult<T> {
  try {
    return parse();
  } catch (error) {
    if (error instanceof SchemaError) return { status: "malformed", reason: error.reason };
    throw error;
  }
}

function parseProject(value: unknown, index: number): Project {
  const where = `projects[${index}]`;
  if (!isObject(value)) fail("schema.field.mustBeObject", { field: where });
  const projectId = str(value, "projectId", where);
  if (!isValidProjectId(projectId)) fail("schema.project.invalidId", { field: `${where}.projectId` });
  const displayName = str(value, "displayName", where);
  if (displayName.trim() === "") fail("schema.project.displayNameEmpty", { field: `${where}.displayName` });
  const repositoryUrl = nullableStr(value, "repositoryUrl", where);
  if (repositoryUrl !== null) {
    const normalized = normalizeRepositoryUrl(repositoryUrl);
    if (!normalized.ok || normalized.value !== repositoryUrl) fail("schema.project.repositoryUrlNotNormalized", { field: `${where}.repositoryUrl` });
  }
  const localRoot = nullableStr(value, "localRoot", where);
  if (localRoot !== null && !normalizeLocalRoot(localRoot).ok) fail("schema.project.localRootNotAbsolute", { field: `${where}.localRoot` });
  return {
    projectId,
    displayName,
    repositoryUrl,
    localRoot,
    developmentIde: nullableStr(value, "developmentIde", where),
    nextAction: str(value, "nextAction", where),
    notes: str(value, "notes", where),
    createdAt: timestamp(value, "createdAt", where),
    updatedAt: timestamp(value, "updatedAt", where),
  };
}

export function parseProjectsFile(text: string): ParseResult<Project[]> {
  return guarded(() => {
    const data = parseJson(text);
    const unsupported = checkVersion(data);
    if (unsupported) return unsupported;
    if (!Array.isArray(data.projects)) fail("schema.projects.mustBeArray");
    const projects = data.projects.map(parseProject);
    const seen = new Set<string>();
    for (const project of projects) {
      if (seen.has(project.projectId)) fail("schema.projects.duplicateId", { id: project.projectId });
      seen.add(project.projectId);
    }
    return { status: "ok", value: projects };
  });
}

function parseRound(value: unknown, index: number): RoundRecord {
  const where = `rounds[${index}]`;
  if (!isObject(value)) fail("schema.field.mustBeObject", { field: where });
  if (value.round !== index + 1) fail("schema.round.numberMustBe", { field: `${where}.round`, expected: index + 1 });
  const verdict = value.verdict;
  if (verdict !== null && !isVerdict(verdict)) fail("schema.round.unknownVerdict", { field: `${where}.verdict` });
  // `archivedResults` was added in the repair (F-6); files written before it omit the key.
  const archived = value.archivedResults === undefined ? [] : value.archivedResults;
  if (!Array.isArray(archived) || !archived.every((name) => isArchivedResultFileName(name, index + 1))) {
    fail("schema.round.archivedResults", { field: `${where}.archivedResults`, round: index + 1 });
  }
  return {
    round: index + 1,
    expectedHead: nullableHead(value, "expectedHead", where),
    reviewedHead: nullableHead(value, "reviewedHead", where),
    requestSavedAt: nullableTimestamp(value, "requestSavedAt", where),
    resultCapturedAt: nullableTimestamp(value, "resultCapturedAt", where),
    verdict,
    verdictConfirmedAt: nullableTimestamp(value, "verdictConfirmedAt", where),
    verdictNote: nullableStr(value, "verdictNote", where),
    archivedResults: [...(archived as string[])],
  };
}

export function parseSessionFile(text: string, expectedReviewId?: string): ParseResult<ReviewSession> {
  return guarded(() => {
    const data = parseJson(text);
    const unsupported = checkVersion(data);
    if (unsupported) return unsupported;
    const where = "session";
    const reviewSessionId = str(data, "reviewSessionId", where);
    if (!isValidReviewId(reviewSessionId)) fail("schema.session.invalidReviewId");
    if (expectedReviewId !== undefined && reviewSessionId !== expectedReviewId) {
      fail("schema.session.idFolderMismatch", { id: reviewSessionId, folder: expectedReviewId });
    }
    const projectId = str(data, "projectId", where);
    if (!isValidProjectId(projectId)) fail("schema.session.invalidProjectId");

    const prNumber = data.prNumber;
    if (prNumber !== null && !positiveInt(prNumber)) fail("schema.session.prNumber");
    const reviewType = str(data, "reviewType", where);
    if (reviewType.trim() === "") fail("schema.session.reviewTypeEmpty");

    if (!isResourceState(data.resourceState)) fail("schema.session.unknownResourceState");
    if (!isReviewState(data.reviewState)) fail("schema.session.unknownReviewState");
    const reviewState = data.reviewState;
    const suspendedFrom = data.suspendedFrom;
    if (reviewState === "SUSPENDED") {
      if (!isResumableState(suspendedFrom)) fail("schema.session.suspendedFromNotResumable");
    } else if (suspendedFrom !== null) {
      fail("schema.session.suspendedFromMustBeNull");
    }

    if (!Array.isArray(data.rounds) || data.rounds.length === 0) fail("schema.session.roundsEmpty");
    if (data.rounds.length > MAX_REVIEW_ROUNDS) fail("schema.session.roundsExceedLimit", { max: MAX_REVIEW_ROUNDS });
    const rounds = data.rounds.map(parseRound);
    if (data.reviewRound !== rounds.length) fail("schema.session.reviewRoundMismatch");

    const chatgptThreadUrl = nullableStr(data, "chatgptThreadUrl", where);
    if (chatgptThreadUrl !== null) {
      const normalized = normalizeChatgptThreadUrl(chatgptThreadUrl);
      // The reason comes from the validator and is a message of its own.
      if (!normalized.ok) {
        throw new SchemaError({
          key: "schema.session.threadUrl",
          params: { field: "session.chatgptThreadUrl" },
          messageParams: { reason: normalized.error },
        });
      }
    }

    return {
      status: "ok",
      value: {
        schemaVersion: SCHEMA_VERSION,
        reviewSessionId,
        projectId,
        prNumber: prNumber as number | null,
        reviewType,
        reviewRound: rounds.length,
        resourceState: data.resourceState,
        reviewState,
        suspendedFrom: reviewState === "SUSPENDED" ? (suspendedFrom as ReviewSession["suspendedFrom"]) : null,
        chatgptThreadTitle: nullableStr(data, "chatgptThreadTitle", where),
        chatgptThreadUrl,
        nextAction: str(data, "nextAction", where),
        rounds,
        createdAt: timestamp(data, "createdAt", where),
        updatedAt: timestamp(data, "updatedAt", where),
      },
    };
  });
}

function parseChange<T>(value: unknown, isState: (v: unknown) => v is T): StateChange<T> | null {
  if (value === null) return null;
  if (!isObject(value)) fail("schema.event.stateChangeMustBeObject");
  if (value.from !== null && !isState(value.from)) fail("schema.event.stateChangeFromUnknown");
  if (!isState(value.to)) fail("schema.event.stateChangeToUnknown");
  return { from: value.from as T | null, to: value.to };
}

export function parseEventLine(line: string): ReviewEvent | null {
  const result = guarded<ReviewEvent>(() => {
    const data = parseJson(line);
    if (data.v !== 1) fail("schema.event.unsupportedVersion");
    if (!isReviewEventType(data.type)) fail("schema.event.unknownType");
    const reviewSessionId = str(data, "reviewSessionId", "event");
    if (!isValidReviewId(reviewSessionId)) fail("schema.event.invalidReviewId");
    if (!positiveInt(data.round)) fail("schema.event.invalidRound");
    return {
      status: "ok",
      value: {
        v: 1,
        ts: timestamp(data, "ts", "event"),
        type: data.type,
        reviewSessionId,
        round: data.round,
        reviewState: parseChange<ReviewState>(data.reviewState, isReviewState),
        resourceState: parseChange<ResourceState>(data.resourceState, isResourceState),
        note: nullableStr(data, "note", "event"),
      },
    };
  });
  return result.status === "ok" ? result.value : null;
}

/** Broken or unknown lines are skipped and counted; the file is never rewritten. */
export function parseEventsFile(text: string): { events: ReviewEvent[]; skippedLines: number } {
  const events: ReviewEvent[] = [];
  let skippedLines = 0;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "") continue;
    const event = parseEventLine(line);
    if (event) events.push(event);
    else skippedLines += 1;
  }
  return { events, skippedLines };
}

export function serializeProjectsFile(projects: readonly Project[]): string {
  return `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, projects }, null, 2)}\n`;
}

export function serializeSession(session: ReviewSession): string {
  return `${JSON.stringify(session, null, 2)}\n`;
}

export function serializeEvent(event: ReviewEvent): string {
  return JSON.stringify(event);
}
