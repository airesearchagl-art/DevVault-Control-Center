// Types for f01-access-gate-harness.mjs, so the product test suite can import it under `strict`.

import type { VerifyResult } from "./f01-synthetic-fixture.mjs";

export declare const OFF_EVENTS: readonly string[];
export declare const UNDECIDED_EVENTS: readonly string[];
export declare const TURN_ON_FAILURE_CODES: readonly TurnOnFailureCode[];
export declare const REFUSAL_CODES: readonly RefusalCode[];
export declare const SOURCE_KEYS: readonly string[];
export declare const T2_CHECKS: readonly T2Check[];

/** `SOURCE_ONLY` is the original T2 and the default; `REVERIFY_STORAGE` is a candidate for comparison. */
export type T2Check = "SOURCE_ONLY" | "REVERIFY_STORAGE";

export type TurnOnFailureCode =
  | "MANIFEST_NOT_PINNED"
  | "VERIFICATION_FAILED"
  | "SOURCE_NOT_VERIFIED"
  | "CHANGED_DURING_CHECK"
  | "CHECK_FAILED"
  | "OPERATION_PENDING"
  | "WRITE_PENDING"
  | "CLOSED";

export type RefusalCode =
  | "ACCESS_OFF"
  | "EPOCH_MISMATCH"
  | "MANIFEST_CHANGED"
  | "VERIFICATION_FAILED"
  | "SOURCE_CHANGED"
  | "CHANGED_DURING_CHECK"
  | "CHECK_FAILED"
  | "OUT_OF_ORDER"
  /** Candidate T2 only. */
  | "CLOSED"
  /** Candidate T2 only. */
  | "UPDATE_PENDING";

export type OffReason =
  | "INITIAL"
  | "EVENT"
  | "UNDECIDED_EVENT"
  | "UNKNOWN_EVENT"
  | "HUMAN_OFF"
  | "REVERIFY"
  | "WRITE_STARTED"
  | "WRITE_SETTLED"
  | "OPERATION_STARTED"
  | "OPERATION_SETTLED"
  | TurnOnFailureCode
  | RefusalCode;

export interface SourceSnapshot {
  readonly digest: string;
  readonly value: unknown;
}

export declare function snapshotSource(source: unknown): SourceSnapshot;
export declare function sourceDigest(source: unknown): string;

export interface Transport {
  send(payload: string): void;
}

export interface RecordingTransport extends Transport {
  calls(): number;
  payloads(): string[];
}

export declare function createRecordingTransport(): RecordingTransport;

export type TurnOnResult = { readonly access: "ON" } | { readonly access: "OFF"; readonly code: TurnOnFailureCode };
export type StageResult =
  | { readonly status: "VERIFIED" }
  | { readonly status: "SENT" }
  | { readonly status: "REFUSED"; readonly code: RefusalCode };

export interface Ticket {
  verify(): StageResult;
  send(): StageResult;
  state(): "RECEIVED" | "VERIFIED" | "SENT" | "REFUSED";
}

export interface Binding {
  readonly manifestId: string;
  readonly sourceDigest: string;
  readonly epoch: number;
}

export interface AccessGateOptions<S = unknown> {
  /** The data folder T0 / T1 verify; required unless `verifyStorage` is given. */
  root?: string;
  /** Verifies the store the services write to against the pinned manifest (default: `root` on disk). */
  verifyStorage?: (manifest: unknown) => VerifyResult;
  pinnedManifestSha256: string;
  sourceFromFiles: (files: Map<string, Buffer>) => S | Promise<S>;
  readSource: () => S;
  respond: (request: unknown, source: unknown) => unknown;
  transport: Transport;
  undecidedEvents: "OFF" | "KEEP";
  /** What T2 checks; `SOURCE_ONLY` when left out. */
  t2Check?: T2Check;
  readManifestBytes?: () => Buffer;
}

export interface PendingToken {
  /** The write or update settled (either way). Counts once, however often it is called. */
  end(): void;
}

export type WriteToken = PendingToken;

export interface AccessGate {
  turnOn(): Promise<TurnOnResult>;
  turnOff(): void;
  close(): void;
  notify(event: string): void;
  beginWrite(event: string): PendingToken;
  /** A service update was called; its token ends when the update's promise settles. */
  beginOperation(name: string): PendingToken;
  /** Storage write calls started and not yet settled. */
  pendingWrites(): number;
  /** Service updates called and not yet settled, including those waiting in a service queue. */
  pendingOperations(): number;
  receive(request: unknown): Ticket;
  handle(request: unknown): StageResult;
  status(): { readonly access: "ON" | "OFF"; readonly epoch: number; readonly reason: OffReason | null };
  binding(): Binding | null;
}

export declare function createAccessGate<S>(options: AccessGateOptions<S>): AccessGate;
