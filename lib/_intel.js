// @dsh-gsd/bundle/intel — the pure, fs-free domain layer for the codebase-intel
// phase (19). Drift detection (CBQX-01) and targeted re-map (CBQX-02) both
// consume the primitives here; nothing in this module touches ctx.fs or the
// host, so it is fully unit-testable without a fake fs or an LLM.
//
// Design notes (phase 19 CONTEXT):
//   - D-01/D-03: drift is detected by comparing the live tree against a stored
//     manifest. The ignore set (.planning/, .git/, node_modules/, lockfiles) is
//     applied at manifest-build time so ignored files never count as drift and
//     never leak secret contents.
//   - D-01 (mtime discretion, resolved in RESEARCH §1.5): the bundle's ctx.fs
//     stat exposes no mtime in fake or real hosts, so the drift signal is a
//     content-derived hash (node:crypto, no new dependency) with size as a cheap
//     first-pass discriminator.
//   - D-05: changed-files -> affected-docs mapping uses a heuristic rule table;
//     overlapping candidates are reconciled by union-and-dedupe.
//   - D-07/R-4: confidence is clamped to [0,1], non-finite falls back to 0.

import { createHash } from "node:crypto";

// ── D-03 ignore set ───────────────────────────────────────────────────────────
// Path prefixes that never count as drift. Matched against the repo-relative
// path prefix (walk prunes these subtrees before descending, so node_modules
// and .git are never walked).
export const IGNORE_PREFIXES = [".planning/", ".git/", "node_modules/"];

// Lockfiles that never count as drift, matched as a full repo-relative path
// (basename anchored at the path end).
export const IGNORE_LOCKFILES =
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|npm-shrinkwrap\.json|bun\.lockb?|composer\.lock|Gemfile\.lock|poetry\.lock|Cargo\.lock)$/;

function isIgnored(path) {
  if (IGNORE_LOCKFILES.test(path)) return true;
  return IGNORE_PREFIXES.some((p) => path.startsWith(p));
}

// ── drift primitives (CBQX-01) ────────────────────────────────────────────────
// buildManifest normalises a walked tree into the persisted manifest shape.
// entries is an array of walked nodes shaped
//   { path: string, type: "file"|"dir", size: number, content?: string }.
// Only FILE entries survive; dirs (and thus empty dirs) are excluded, and the
// D-03 ignore set is pruned. Each surviving file yields { path, size, hash }.
export function buildManifest(entries) {
  const out = new Map();
  for (const e of entries || []) {
    if (e.type !== "file") continue;
    if (isIgnored(e.path)) continue;
    const hash = createHash("sha1").update(String(e.content ?? "")).digest("hex");
    out.set(e.path, { path: e.path, size: e.size, hash });
  }
  return [...out.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

// compareManifest diff two manifests (arrays of { path, size, hash }) and
// return { added, removed, modified }, each a sorted array of paths. A file is
// modified when its size differs, or when both records have a defined hash and
// the hashes differ; when a record's hash is undefined but sizes match, it is
// NOT modified (per D-01/R-3: size is the cheap first-pass discriminator).
export function compareManifest(manifest, current) {
  const m = new Map((manifest || []).map((r) => [r.path, r]));
  const c = new Map((current || []).map((r) => [r.path, r]));

  const added = [];
  const removed = [];
  const modified = [];

  for (const path of c.keys()) {
    if (!m.has(path)) { added.push(path); continue; }
    const a = m.get(path);
    const b = c.get(path);
    if (a.size !== b.size) { modified.push(path); continue; }
    if (a.hash !== undefined && b.hash !== undefined && a.hash !== b.hash) {
      modified.push(path);
    }
  }
  for (const path of m.keys()) {
    if (!c.has(path)) removed.push(path);
  }

  const sort = (arr) => arr.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  return { added: sort(added), removed: sort(removed), modified: sort(modified) };
}

// clampConfidence (D-07/R-4): normalise a self-reported 0-1 score to [0,1];
// non-finite input falls back to 0 so structured-failure never yields NaN.
export function clampConfidence(n) {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}
