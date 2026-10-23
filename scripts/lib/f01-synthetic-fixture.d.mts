// Types for f01-synthetic-fixture.mjs, so the product test suite can import it under `strict`.

export declare const FIXTURE_DIR: string;
export declare const DATA_ROOT: string;
export declare const MANIFEST_PATH: string;
export declare const TEMP_COPY_PREFIX: string;
export declare const MANIFEST_FORMAT: string;
export declare const LOCK_RULE: string;
export declare const LIMITS: Readonly<{ maxEntries: number; maxDepth: number; maxFileBytes: number }>;

export declare const FIXTURE: Readonly<{
  fixtureId: string;
  projectId: string;
  reviewId: string;
  owner: string;
  name: string;
  prNumber: number;
  head: string;
}>;

export declare const SENTINELS: Readonly<Record<string, string>>;

export type FindingCode =
  | "ROOT_NOT_ALLOWED"
  | "ROOT_INVALID"
  | "MANIFEST_INVALID"
  | "LIMIT_EXCEEDED"
  | "SCAN_FAILED"
  | "LINK_OR_REPARSE"
  | "RUNTIME_FILE_INVALID"
  | "NOT_EXPECTED_KIND"
  | "UNEXPECTED_ENTRY"
  | "TRANSIENT_STORAGE_FILE"
  | "CONTENT_MISMATCH"
  | "CHANGED_OR_UNREADABLE"
  | "MISSING_FILE"
  | "MISSING_DIRECTORY";

export interface Finding {
  code: FindingCode;
  path: string | null;
}

export type VerifyResult =
  | { ok: true; findings: []; files: Map<string, Buffer> }
  | { ok: false; findings: Finding[]; files: null };

export interface ParsedManifest {
  files: Map<string, { size: number; sha256: string }>;
  dirs: Set<string>;
  lock: string;
}

export interface ListedEntry {
  path: string;
  kind: "file" | "dir" | "link" | "other";
  size: number;
  redirected: boolean;
}

export declare function fixtureFiles(): Map<string, string>;
export declare function manifestText(files?: Map<string, string>): string;
export declare function readManifest(): unknown;
export declare function isAllowedRoot(root: string): boolean;
export declare function parseManifest(value: unknown): ParsedManifest | null;
export declare function evaluateEntries<E extends ListedEntry>(
  entries: readonly E[],
  manifest: ParsedManifest,
  read: (entry: E) => Buffer | null,
): VerifyResult;
export declare function verifyDataRoot(root: string, manifest: unknown): VerifyResult;
export declare function generateFixture(): void;
