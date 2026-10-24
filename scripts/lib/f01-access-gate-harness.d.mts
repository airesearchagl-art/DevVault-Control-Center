// Types for f01-access-gate-harness.mjs, so the product test suite can import it under `strict`.

import type { VerifyResult } from "./f01-synthetic-fixture.mjs";

export declare const OFF_EVENTS: readonly string[];
export declare const UNDECIDED_EVENTS: readonly string[];
export declare const TURN_ON_FAILURE_CODES: readonly TurnOnFailureCode[];
export declare const REFUSAL_CODES: readonly RefusalCode[];
export declare const SOURCE_KEYS: readonly string[];

export type TurnOnFailureCode =
  | "MANIFEST_NOT_PINNED"
  | "VERIFICATION_FAILED"
  | "SOURCE_NOT_VERIFIED"
  | "CHANGED_DURING_CHECK"
  | "CHECK_FAILED"
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
  | "OUT_OF_ORDER";

export type OffReason =
  | "INITIAL"
  | "EVENT"
  | "UNDECIDED_EVENT"
  | "UNKNOWN_EVENT"
  | "HUMAN_OFF"
  | "REVERIFY"
  | "WRITE_STARTED"
  | "WRITE_SETTLED"
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
  readManifestBytes?: () => Buffer;
}

export interface WriteToken {
  /** The write settled (either way). Counts once, however often it is called. */
  end(): void;
}

export interface AccessGate {
  turnOn(): Promise<TurnOnResult>;
  turnOff(): void;
  close(): void;
  notify(event: string): void;
  beginWrite(event: string): WriteToken;
  pendingWrites(): number;
  receive(request: unknown): Ticket;
  handle(request: unknown): StageResult;
  status(): { readonly access: "ON" | "OFF"; readonly epoch: number; readonly reason: OffReason | null };
  binding(): Binding | null;
}

export declare function createAccessGate<S>(options: AccessGateOptions<S>): AccessGate;
