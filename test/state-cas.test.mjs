/**
 * Compare-and-swap on casp/state.json — the other half of the 2026-07-20
 * incident. `saveState` became atomic (temp + rename) in 0.12.1, which protects
 * a PARTIAL write (crash, full disk). It does nothing for an OVERWRITTEN one:
 * two agents wrote the same casp/ in parallel that day and the second silently
 * clobbered the first — by luck, not by design.
 *
 * The fix: loadStateWithHash() remembers the hash of what it read; saveState()
 * re-hashes the file right before the rename and refuses on any mismatch. No
 * lock, no merge — an honest refusal, nothing written.
 *
 * Unit-level (imports dist/shared.js directly) because reproducing a genuine
 * inter-process race deterministically through the CLI is not the point here —
 * the point is that saveState's own compare-and-swap logic is correct.
 *
 * Runs against the BUILT module (dist/shared.js); `pretest` builds first.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { loadState, loadStateWithHash, saveState, StateConflictError } = await import(
  new URL('../dist/shared.js', import.meta.url)
);

function scratch() {
  return mkdtempSync(join(tmpdir(), 'casp-cas-'));
}

test('loadStateWithHash: hash changes when the file content changes', () => {
  const dir = scratch();
  try {
    const path = join(dir, 'state.json');
    writeFileSync(path, JSON.stringify({ a: 1 }));
    const first = loadStateWithHash(path);
    writeFileSync(path, JSON.stringify({ a: 2 }));
    const second = loadStateWithHash(path);
    assert.notEqual(first.hash, second.hash);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('saveState: no expectedHash → writes unconditionally (unchanged pre-existing behavior)', () => {
  const dir = scratch();
  try {
    const path = join(dir, 'state.json');
    writeFileSync(path, JSON.stringify({ a: 1 }));
    saveState(path, { a: 2 });
    assert.deepEqual(loadState(path), { a: 2 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('saveState: expectedHash still matches → writes normally', () => {
  const dir = scratch();
  try {
    const path = join(dir, 'state.json');
    writeFileSync(path, JSON.stringify({ a: 1 }, null, 2) + '\n');
    const { state, hash } = loadStateWithHash(path);
    state.a = 2;
    saveState(path, state, hash);
    assert.deepEqual(loadState(path), { a: 2 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('saveState: file changed on disk after read → StateConflictError, nothing written', () => {
  const dir = scratch();
  try {
    const path = join(dir, 'state.json');
    writeFileSync(path, JSON.stringify({ a: 1 }, null, 2) + '\n');

    // Agent A reads state (gets a hash of {a:1}).
    const { state: stateA, hash: hashA } = loadStateWithHash(path);

    // Agent B writes in between — the exact race the incident exhibited.
    writeFileSync(path, JSON.stringify({ a: 'written-by-B' }, null, 2) + '\n');

    // Agent A now tries to save its own mutation against the STALE hash.
    stateA.a = 'written-by-A';
    assert.throws(() => saveState(path, stateA, hashA), StateConflictError);

    // B's write must survive untouched — A's write must never have happened.
    assert.deepEqual(loadState(path), { a: 'written-by-B' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('saveState: conflict leaves no leftover temp file', () => {
  const dir = scratch();
  try {
    const path = join(dir, 'state.json');
    writeFileSync(path, JSON.stringify({ a: 1 }, null, 2) + '\n');
    const { state, hash } = loadStateWithHash(path);
    writeFileSync(path, JSON.stringify({ a: 2 }, null, 2) + '\n');
    assert.throws(() => saveState(path, state, hash), StateConflictError);
    const leftovers = readdirSync(dir).filter((f) => f.includes('.tmp'));
    assert.deepEqual(leftovers, [], 'the temp file must be cleaned up on a refused write');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
