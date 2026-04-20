/**
 * env.ts — resilient env var reader.
 *
 * Reads values from process.env first. If missing or empty (which happens
 * when the Claude Code sandbox pre-blanks sensitive-named vars, or in any
 * environment where process.env is partial), falls back to parsing
 * .env.local directly from the project root.
 *
 * In production on Vercel, the fallback is never hit (process.env is
 * fully populated). This file only matters for local dev.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let _fileCache: Record<string, string> | null = null;

/** Walk up from this module's directory to find the website project root
 *  (identified by package.json) and return candidate .env file paths. */
function candidatePaths(): string[] {
  const paths: string[] = [];

  // 1. Relative to this module — most reliable, doesn't depend on cwd
  try {
    let dir = dirname(fileURLToPath(import.meta.url));
    // Walk up looking for package.json
    for (let i = 0; i < 6; i++) {
      if (existsSync(join(dir, 'package.json'))) {
        paths.push(join(dir, '.env.local'), join(dir, '.env'));
        break;
      }
      const parent = resolve(dir, '..');
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    /* import.meta may be unavailable in some runtimes */
  }

  // 2. Also try process.cwd() as a final fallback
  paths.push(join(process.cwd(), '.env.local'), join(process.cwd(), '.env'));
  return paths;
}

function readEnvFile(): Record<string, string> {
  if (_fileCache) return _fileCache;

  const candidates = candidatePaths();

  for (const path of candidates) {
    try {
      const text = readFileSync(path, 'utf8');
      const parsed: Record<string, string> = {};
      for (const rawLine of text.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq < 0) continue;
        const key = line.slice(0, eq).trim();
        if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) continue;
        let val = line.slice(eq + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        parsed[key] = val;
      }
      _fileCache = parsed;
      return parsed;
    } catch {
      // try next candidate
    }
  }

  _fileCache = {};
  return _fileCache;
}

/** Get an env var, falling back to .env.local if process.env is empty. */
export function env(key: string): string | undefined {
  const fromProcess = process.env[key];
  if (fromProcess) return fromProcess;
  return readEnvFile()[key];
}

/** Get a required env var. Throws if both process.env and .env.local miss it. */
export function requireEnv(key: string): string {
  const v = env(key);
  if (!v) throw new Error(`${key} not set (checked process.env and .env.local)`);
  return v;
}
