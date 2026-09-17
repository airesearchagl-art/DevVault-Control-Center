import { isReviewEventType, type ReviewEvent, type StateChange } from "./events";
import type { Project } from "./project";
import { SCHEMA_VERSION, type ReviewSession, type RoundRecord } from "./review";
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
  | { status: "malformed"; reason: string }
  | { status: "unsupported_version"; version: number };

type Obj = Record<string, unknown>;

class SchemaError extends Error {}

function fail(reason: string): never {
  throw new SchemaError(reason);
}

function isObject(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(obj: Obj, key: string, where: string): string {
  const value = obj[key];
  if (typeof value !== "string") fail(`${where}.${key} must be a string`);
  return value;
}

function nullableStr(obj: Obj, key: string, where: string): string | null {
  const value = obj[key];
  if (value === null) return null;
  if (typeof value !== "string") fail(`${where}.${key} must be a string or null`);
  return value;
}

function timestamp(obj: Obj, key: string, where: string): string {
  const value = obj[key];
  if (!isIsoTimestamp(value)) fail(`${where}.${key} must be an ISO-8601 UTC timestamp`);
  return value;
}

function nullableTimestamp(obj: Obj, key: string, where: string): string | null {
  const value = obj[key];
  if (value === null) return null;
  if (!isIsoTimestamp(value)) fail(`${where}.${key} must be an ISO-8601 UTC timestamp or null`);
  return value;
}

function nullableHead(obj: Obj, key: string, where: string): string | null {
  const value = obj[key];
  if (value === null) return null;
  if (!isValidHead(value)) fail(`${where}.${key} must be a lowercase 7–40 hex SHA or null`);
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
    fail(`invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isObject(data)) fail("top-level value must be an object");
  return data;
}

/** Returns an `unsupported_version` result when the file declares a newer schema. */
function checkVersion(data: Obj): { status: "unsupported_version"; version: number } | null {
  const version = data.schemaVersion;
  if (typeof version === "number" && Number.isInteger(version) && version > SCHEMA_VERSION) {
    return { status: "unsupported_version", version };
  }
  if (version !== SCHEMA_VERSION) fail(`schemaVersion must be ${SCHEMA_VERSION}`);
  return null;
}

function guarded<T>(parse: () => ParseResult<T>): ParseResult<T> {
  try {
    return parse();
  } catch (error) {
    if (error instanceof SchemaError) return { status: "malformed", reason: error.message };
    throw error;
  }
}

function parseProject(value: unknown, index: number): Project {
  const where = `projects[${index}]`;
  if (!isObject(value)) fail(`${where} must be an object`);
  const projectId = str(value, "projectId", where);
  if (!isValidProjectId(projectId)) fail(`${where}.projectId is not a valid project id`);
  const displayName = str(value, "displayName", where);
  if (displayName.trim() === "") fail(`${where}.displayName must not be empty`);
  const repositoryUrl = nullableStr(value, "repositoryUrl", where);
  if (repositoryUrl !== null) {
    const normalized = normalizeRepositoryUrl(repositoryUrl);
    if (!normalized.ok || normalized.value !== repositoryUrl) fail(`${where}.repositoryUrl is not a normalized GitHub repository URL`);
  }
  const localRoot = nullableStr(value, "localRoot", where);
  if (localRoot !== null && !normalizeLocalRoot(localRoot).ok) fail(`${where}.localRoot is not an absolute drive path`);
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
    if (!Array.isArray(data.projects)) fail("projects must be an array");
    const projects = data.projects.map(parseProject);
    const seen = new Set<string>();
    for (const project of projects) {
      if (seen.has(project.projectId)) fail(`duplicate projectId: ${project.projectId}`);
      seen.add(project.projectId);
    }
    return { status: "ok", value: projects };
  });
}

function parseRound(value: unknown, index: number): RoundRecord {
  const where = `rounds[${index}]`;
  if (!isObject(value)) fail(`${where} must be an object`);
  if (value.round !== index + 1) fail(`${where}.round must be ${index + 1}`);
  const verdict = value.verdict;
  if (verdict !== null && !isVerdict(verdict)) fail(`${where}.verdict is not a known verdict`);
  return {
    round: index + 1,
    expectedHead: nullableHead(value, "expectedHead", where),
    reviewedHead: nullableHead(value, "reviewedHead", where),
    requestSavedAt: nullableTimestamp(value, "requestSavedAt", where),
    resultCapturedAt: nullableTimestamp(value, "resultCapturedAt", where),
    verdict,
    verdictConfirmedAt: nullableTimestamp(value, "verdictConfirmedAt", where),
    verdictNote: nullableStr(value, "verdictNote", where),
  };
}

export function parseSessionFile(text: string, expectedReviewId?: string): ParseResult<ReviewSession> {
  return guarded(() => {
    const data = parseJson(text);
    const unsupported = checkVersion(data);
    if (unsupported) return unsupported;
    const where = "session";
    const reviewSessionId = str(data, "reviewSessionId", where);
    if (!isValidReviewId(reviewSessionId)) fail("session.reviewSessionId is not a valid review id");
    if (expectedReviewId !== undefined && reviewSessionId !== expectedReviewId) {
      fail(`session.reviewSessionId (${reviewSessionId}) does not match its folder (${expectedReviewId})`);
    }
    const projectId = str(data, "projectId", where);
    if (!isValidProjectId(projectId)) fail("session.projectId is not a valid project id");

    const prNumber = data.prNumber;
    if (prNumber !== null && !positiveInt(prNumber)) fail("session.prNumber must be a positive integer or null");
    const reviewType = str(data, "reviewType", where);
    if (reviewType.trim() === "") fail("session.reviewType must not be empty");

    if (!isResourceState(data.resourceState)) fail("session.resourceState is not a known resource state");
    if (!isReviewState(data.reviewState)) fail("session.reviewState is not a known review state");
    const reviewState = data.reviewState;
    const suspendedFrom = data.suspendedFrom;
    if (reviewState === "SUSPENDED") {
      if (!isResumableState(suspendedFrom)) fail("session.suspendedFrom must be a resumable state while SUSPENDED");
    } else if (suspendedFrom !== null) {
      fail("session.suspendedFrom must be null unless SUSPENDED");
    }

    if (!Array.isArray(data.rounds) || data.rounds.length === 0) fail("session.rounds must be a non-empty array");
    const rounds = data.rounds.map(parseRound);
    if (data.reviewRound !== rounds.length) fail("session.reviewRound must equal the number of rounds");

    const chatgptThreadUrl = nullableStr(data, "chatgptThreadUrl", where);
    if (chatgptThreadUrl !== null) {
      const normalized = normalizeChatgptThreadUrl(chatgptThreadUrl);
      if (!normalized.ok) fail(`session.chatgptThreadUrl: ${normalized.error}`);
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
  if (!isObject(value)) fail("state change must be an object or null");
  if (value.from !== null && !isState(value.from)) fail("state change.from is not a known state");
  if (!isState(value.to)) fail("state change.to is not a known state");
  return { from: value.from as T | null, to: value.to };
}

export function parseEventLine(line: string): ReviewEvent | null {
  const result = guarded<ReviewEvent>(() => {
    const data = parseJson(line);
    if (data.v !== 1) fail("unsupported event version");
    if (!isReviewEventType(data.type)) fail("unknown event type");
    const reviewSessionId = str(data, "reviewSessionId", "event");
    if (!isValidReviewId(reviewSessionId)) fail("invalid reviewSessionId");
    if (!positiveInt(data.round)) fail("invalid round");
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
