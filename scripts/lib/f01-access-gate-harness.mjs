// Access-gate harness for the F01 synthetic-only pilot (DVCC-F01-ACCESS-GATE-HARNESS-01).
//
// Candidate logic for docs/f01-synthetic-data-boundary.md §6.5 (stop publishing when the state or the
// storage changes) and §6.6 (T0 / T1 / T2), exercised only against the synthetic fixture. Nothing in
// the product imports this file and it has no CLI. Sending is a recording stand-in: it counts calls
// and keeps the payloads in memory, and nothing leaves the process. Events reach the gate only through
// `notify`, called by the tests; the harness does not hook into the application or watch any folder.
//
// SHA-256 comes from Node's built-in crypto for this harness only. It decides nothing about the
// application's SHA-256 implementation (HD-06).
//
// There are no timers and no clock: every transition happens inside a call the caller makes, so a
// test can place events between the steps in any order.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { MANIFEST_PATH, verifyDataRoot } from "./f01-synthetic-fixture.mjs";

/**
 * Events that turn access OFF (§6.5 rule 3): the three state actions named there, `fatal` (it changes
 * `phase`, one of the five source keys), a settings write, a storage write / append / set-aside /
 * restore, and a verification failure reported from outside. Storage commands turn access OFF whether
 * they succeeded or not, since a failed write can still leave a temp file behind.
 */
export const OFF_EVENTS = Object.freeze([
  "loaded",
  "hubCommitted",
  "gitObserved",
  "fatal",
  "settings.write",
  "storage.write",
  "storage.appendLine",
  "storage.quarantine",
  "storage.restoreBackup",
  "verification.failed",
]);

/**
 * Events §6.5 leaves open: they do not touch the five source keys (selection, filter, notices, toasts,
 * IDE session scans, artifact loading, storage reads). Whether they turn access OFF is not decided, so
 * the caller has to choose with `undecidedEvents`. Any event in neither list turns access OFF.
 */
export const UNDECIDED_EVENTS = Object.freeze([
  "selectReview",
  "filterChanged",
  "artifactsLoaded",
  "ideSessionsRefreshing",
  "ideSessionsLoaded",
  "ideSessionsFailed",
  "dismissNotice",
  "toast",
  "dismissToast",
  "storage.info",
  "storage.read",
  "storage.listReviews",
  "storage.assertUnchanged",
]);

/** Why `turnOn()` left access OFF. */
export const TURN_ON_FAILURE_CODES = Object.freeze([
  "MANIFEST_NOT_PINNED",
  "VERIFICATION_FAILED",
  "SOURCE_NOT_VERIFIED",
  "CHANGED_DURING_CHECK",
  "CHECK_FAILED",
]);

/** Why a request was refused. The caller gets only this code, never the response. */
export const REFUSAL_CODES = Object.freeze([
  "ACCESS_OFF",
  "EPOCH_MISMATCH",
  "MANIFEST_CHANGED",
  "VERIFICATION_FAILED",
  "SOURCE_CHANGED",
  "CHANGED_DURING_CHECK",
  "CHECK_FAILED",
  "OUT_OF_ORDER",
]);

/** The Control Read source keys (`src/app/controlReadSource.ts`), sorted. Nothing else is digested. */
export const SOURCE_KEYS = Object.freeze(["gitObservations", "phase", "projects", "projectsHealth", "reviews"]);

const DIGEST_LABEL = "dvcc.f01-access-gate.source.v1\n";
const MAX_DEPTH = 32;

class SourceShapeError extends Error {}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Canonical JSON: object keys sorted, `undefined` object properties left out (as absent), and
 * everything JSON cannot carry exactly rejected (non-finite numbers, `undefined` or holes in arrays,
 * functions, symbols, bigints, class instances, cycles).
 */
function canonical(value, depth) {
  if (depth > MAX_DEPTH) throw new SourceShapeError();
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new SourceShapeError();
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items = [];
    for (let i = 0; i < value.length; i += 1) {
      if (!(i in value) || value[i] === undefined) throw new SourceShapeError();
      items.push(canonical(value[i], depth + 1));
    }
    return `[${items.join(",")}]`;
  }
  if (typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new SourceShapeError();
    const parts = [];
    for (const key of Object.keys(value).sort(byCodeUnit)) {
      const item = value[key];
      if (item !== undefined) parts.push(`${JSON.stringify(key)}:${canonical(item, depth + 1)}`);
    }
    return `{${parts.join(",")}}`;
  }
  throw new SourceShapeError();
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

/**
 * Takes one canonical reading of a Control Read source: exactly the five keys, none of them
 * `undefined`. Returns its digest and a deep-frozen copy parsed back from the digested text, so what
 * a response is built from is exactly what was digested, and later changes to the live objects never
 * reach it. Throws on any other shape.
 */
export function snapshotSource(source) {
  if (source === null || typeof source !== "object" || Array.isArray(source)) throw new SourceShapeError();
  const keys = Object.keys(source).sort(byCodeUnit);
  if (keys.length !== SOURCE_KEYS.length || keys.some((key, i) => key !== SOURCE_KEYS[i] || source[key] === undefined)) {
    throw new SourceShapeError();
  }
  const text = canonical(source, 0);
  const digest = createHash("sha256").update(DIGEST_LABEL).update(text, "utf8").digest("hex");
  return Object.freeze({ digest, value: deepFreeze(JSON.parse(text)) });
}

export function sourceDigest(source) {
  return snapshotSource(source).digest;
}

/** A stand-in transport: counts calls and keeps the payloads in memory. It sends nothing anywhere. */
export function createRecordingTransport() {
  const sent = [];
  return Object.freeze({
    send(payload) {
      sent.push(payload);
    },
    calls: () => sent.length,
    payloads: () => [...sent],
  });
}

const VERIFIED = Object.freeze({ status: "VERIFIED" });
const SENT = Object.freeze({ status: "SENT" });
const refusal = (code) => Object.freeze({ status: "REFUSED", code });

/**
 * The gate. Access starts OFF and lives in memory only.
 *
 * - T0 `turnOn()` (the Human action): the committed manifest must hash to `pinnedManifestSha256`, the
 *   folder must verify against it, and the live source must equal the source the verified bytes
 *   produce (`sourceFromFiles`). Only then is the binding recorded: manifest ID, source digest and a
 *   new epoch.
 * - T1 `ticket.verify()` (each request): access ON, the ticket's epoch is current, the manifest ID is
 *   unchanged, the folder verifies again, and the live source digest equals the bound one. The
 *   response is built from the frozen copy digested here and serialized at once.
 * - T2 `ticket.send()` (immediately before sending): access ON, the epoch is current, and the live
 *   source digest still equals the bound one and the one checked at T1. Only then is the payload
 *   handed to the transport, once.
 *
 * Reading the live source can run other code, which may raise an event. So after every read, at T0,
 * T1 and T2, the gate checks again that access is ON (T1 / T2) and that the epoch has not moved, and
 * refuses with `CHANGED_DURING_CHECK` otherwise.
 *
 * Every OFF advances the epoch, so a ticket from before an OFF is refused even after access is ON
 * again with the same data. A refusal of an out-of-date ticket does not turn access OFF again: it
 * says nothing about the current data. Any failed or throwing check does. Nothing turns access back ON
 * except `turnOn()`. A refused ticket gives the caller a fixed code and never the response.
 */
export function createAccessGate(options) {
  const { root, pinnedManifestSha256, sourceFromFiles, readSource, respond, transport, undecidedEvents } = options;
  const readManifestBytes = options.readManifestBytes ?? (() => readFileSync(MANIFEST_PATH));
  if (typeof pinnedManifestSha256 !== "string" || !/^[0-9a-f]{64}$/.test(pinnedManifestSha256)) {
    throw new TypeError("pinnedManifestSha256 must be a lowercase SHA-256");
  }
  for (const fn of [sourceFromFiles, readSource, respond, readManifestBytes]) {
    if (typeof fn !== "function") throw new TypeError("missing function option");
  }
  if (transport === null || typeof transport !== "object" || typeof transport.send !== "function") {
    throw new TypeError("missing transport");
  }
  if (undecidedEvents !== "OFF" && undecidedEvents !== "KEEP") {
    throw new TypeError('undecidedEvents must be "OFF" or "KEEP" (undecided, §6.5)');
  }

  let epoch = 0;
  /** `{ manifestId, sourceDigest, epoch }` while access is ON, otherwise `null`. */
  let binding = null;
  let reason = "INITIAL";

  const off = (code) => {
    binding = null;
    epoch += 1;
    reason = code;
  };

  function loadManifest() {
    const bytes = readManifestBytes();
    return { id: sha256(bytes), value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
  }

  async function turnOn() {
    if (binding !== null) off("REVERIFY");
    const start = epoch;
    const fail = (code) => {
      off(code);
      return Object.freeze({ access: "OFF", code });
    };
    let manifest;
    let files;
    try {
      manifest = loadManifest();
      if (manifest.id !== pinnedManifestSha256) return fail("MANIFEST_NOT_PINNED");
      const result = verifyDataRoot(root, manifest.value);
      if (!result.ok) return fail("VERIFICATION_FAILED");
      files = result.files;
    } catch {
      return fail("CHECK_FAILED");
    }
    let expected;
    try {
      expected = snapshotSource(await sourceFromFiles(files)).digest;
    } catch {
      return fail("CHECK_FAILED");
    }
    if (epoch !== start) return fail("CHANGED_DURING_CHECK");
    let live;
    try {
      live = snapshotSource(readSource()).digest;
    } catch {
      return fail("CHECK_FAILED");
    }
    // The read itself may have raised an event (RF-F01-GATE-IR01-01). Nothing after this check runs
    // other code before the binding is recorded.
    if (epoch !== start) return fail("CHANGED_DURING_CHECK");
    if (live !== expected) return fail("SOURCE_NOT_VERIFIED");
    epoch += 1;
    binding = Object.freeze({ manifestId: manifest.id, sourceDigest: live, epoch });
    reason = null;
    return Object.freeze({ access: "ON" });
  }

  function notify(event) {
    if (OFF_EVENTS.includes(event)) off("EVENT");
    else if (UNDECIDED_EVENTS.includes(event)) {
      if (undecidedEvents === "OFF") off("UNDECIDED_EVENT");
    } else off("UNKNOWN_EVENT");
  }

  function receive(request) {
    const ticketEpoch = epoch;
    let state = binding === null ? "REFUSED" : "RECEIVED";
    let refused = binding === null ? refusal("ACCESS_OFF") : null;
    let payload = null;
    let checkedDigest = null;

    const refuse = (code) => {
      state = "REFUSED";
      refused = refusal(code);
      payload = null;
      checkedDigest = null;
      return refused;
    };
    const stop = (code) => {
      off(code);
      return refuse(code);
    };
    const outOfOrder = () => {
      if (state === "REFUSED") return refused;
      if (state === "SENT") return refusal("OUT_OF_ORDER");
      return refuse("OUT_OF_ORDER");
    };
    const current = () => binding !== null && ticketEpoch === epoch && binding.epoch === ticketEpoch;

    function verify() {
      if (state !== "RECEIVED") return outOfOrder();
      if (binding === null) return refuse("ACCESS_OFF");
      if (!current()) return refuse("EPOCH_MISMATCH");
      const bound = binding;
      try {
        const manifest = loadManifest();
        if (manifest.id !== bound.manifestId) return stop("MANIFEST_CHANGED");
        if (!verifyDataRoot(root, manifest.value).ok) return stop("VERIFICATION_FAILED");
        const snapshot = snapshotSource(readSource());
        if (binding !== bound || !current()) return refuse("CHANGED_DURING_CHECK");
        if (snapshot.digest !== bound.sourceDigest) return stop("SOURCE_CHANGED");
        const text = JSON.stringify(respond(request, snapshot.value));
        if (typeof text !== "string") return stop("CHECK_FAILED");
        if (binding !== bound || !current()) return refuse("CHANGED_DURING_CHECK");
        payload = text;
        checkedDigest = snapshot.digest;
        state = "VERIFIED";
        return VERIFIED;
      } catch {
        return stop("CHECK_FAILED");
      }
    }

    function send() {
      if (state !== "VERIFIED") return outOfOrder();
      if (binding === null) return refuse("ACCESS_OFF");
      if (!current()) return refuse("EPOCH_MISMATCH");
      const bound = binding;
      let digest;
      try {
        digest = snapshotSource(readSource()).digest;
      } catch {
        return stop("CHECK_FAILED");
      }
      // The read itself may have raised an event (RF-F01-GATE-IR01-02).
      if (binding !== bound || !current()) return refuse("CHANGED_DURING_CHECK");
      if (digest !== bound.sourceDigest || digest !== checkedDigest) return stop("SOURCE_CHANGED");
      const text = payload;
      payload = null;
      checkedDigest = null;
      state = "SENT";
      transport.send(text);
      return SENT;
    }

    return Object.freeze({ verify, send, state: () => state });
  }

  function handle(request) {
    const ticket = receive(request);
    const checked = ticket.verify();
    return checked.status === "VERIFIED" ? ticket.send() : checked;
  }

  return Object.freeze({
    turnOn,
    turnOff: () => off("HUMAN_OFF"),
    notify,
    receive,
    handle,
    status: () => Object.freeze({ access: binding === null ? "OFF" : "ON", epoch, reason }),
    binding: () => binding,
  });
}
