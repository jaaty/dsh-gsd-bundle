// In-memory fake for the DSH host `fs` service (ctx.fs), so GsdState and the
// phase tools can be exercised deterministically without a live harness.
// Mirrors the contract the bundle uses: resolve/processPath/stat/readText/
// writeText/listDir. `writeText` auto-creates parent directories — matching
// @deepseek-ai/dsh-fs-local's writeFileAtomic behavior.

import path from "node:path";

export class FakeFs {
  constructor() {
    this.files = new Map(); // targetKey -> content
    this.dirs = new Set();  // targetKey -> exists
  }

  register(p) {
    let d = path.dirname(p);
    while (!this.dirs.has(d) && d !== "/" && d !== ".") {
      this.dirs.add(d);
      d = path.dirname(d);
    }
  }

  async resolve(p) {
    return { targetKey: p, displayPath: p };
  }

  processPath(target) {
    return target.targetKey;
  }

  async stat(target) {
    const key = target.targetKey;
    if (this.files.has(key)) return { type: "file", size: this.files.get(key).length };
    if (this.dirs.has(key)) return { type: "directory" };
    return undefined;
  }

  async readText(target) {
    return this.files.get(target.targetKey);
  }

  async writeText(target, content) {
    this.files.set(target.targetKey, content);
    this.register(target.targetKey);
  }

  async listDir(target) {
    const prefix = target.targetKey.endsWith("/") ? target.targetKey : `${target.targetKey}/`;
    const keys = new Set([...this.files.keys(), ...this.dirs]);
    const names = [];
    for (const k of keys) {
      if (!k.startsWith(prefix)) continue;
      const rest = k.slice(prefix.length);
      if (!rest.includes("/")) names.push(rest);
    }
    return names.map((name) => ({
      name,
      type: this.files.has(`${prefix}${name}`) ? "file" : "directory",
      target: { targetKey: `${prefix}${name}`, displayPath: `${prefix}${name}` },
    }));
  }
}

// Minimal fake `ctx` for constructing GsdState standalone.
export function stateCtx(fs) {
  return {
    fs,
    get: () => undefined,
    provide: () => {},
    effect: () => () => {},
  };
}

// Real-fs-backed adapter (for reading live .planning/ trees in tests that
// snapshot real artifacts).
import { promises as fsPromises } from "node:fs";

export function realFsAdapter() {
  return {
    async resolve(p) {
      return { targetKey: p, displayPath: p };
    },
    processPath(t) {
      return t.targetKey;
    },
    async stat(t) {
      try {
        const s = await fsPromises.stat(t.targetKey);
        return s.isDirectory() ? { type: "directory" } : { type: "file", size: s.size };
      } catch {
        return undefined;
      }
    },
    async readText(t) {
      return fsPromises.readFile(t.targetKey, "utf8");
    },
    async writeText(t, content) {
      await fsPromises.writeFile(t.targetKey, content, "utf8");
    },
    async listDir(t) {
      const ents = await fsPromises.readdir(t.targetKey, { withFileTypes: true });
      return ents.map((e) => ({
        name: e.name,
        type: e.isDirectory() ? "directory" : "file",
        target: { targetKey: path.join(t.targetKey, e.name), displayPath: path.join(t.displayPath, e.name) },
      }));
    },
  };
}
