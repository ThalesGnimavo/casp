/**
 * The shipped `fleet` skill — a public rewrite of a private working document.
 * The acceptance gate is mechanical and stays enforced here so a future edit
 * cannot silently reintroduce what the rewrite removed: absolute paths, model
 * names, private repository names, or a speed claim. The boundary sentence
 * ("not part of CASP") must also survive, because it is the reason the skill
 * is allowed to ship in this package at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SKILL_PATH = join(process.cwd(), 'skills', 'fleet', 'SKILL.md');

test('skills/fleet/SKILL.md ships in the package', () => {
  assert.ok(existsSync(SKILL_PATH), 'skills/fleet/SKILL.md must exist');
  const files = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')).files;
  assert.ok(files.includes('skills'), "package.json 'files' must include 'skills'");
});

const body = () => readFileSync(SKILL_PATH, 'utf8');

test('fleet skill contains zero absolute home-directory paths', () => {
  assert.doesNotMatch(body(), /\/Users\/|\/home\/|C:\\Users/i);
});

test('fleet skill contains zero model names', () => {
  // Word-bounded: "directory" must not trip a bare "cto"-style substring match.
  assert.doesNotMatch(body(), /\b(opus|sonnet|haiku|fable|claude|gpt-?[0-9o]*|gemini|grok|qwen|deepseek|llama|mistral)\b/i);
});

test('fleet skill names no repository other than this package', () => {
  // The private original named sibling repositories; none may survive the rewrite.
  assert.doesNotMatch(body(), /\b(zerosuite|deblo|senndo|sh0|flin|veostudio|poponi)\b|tap\.ci/i);
});

test('fleet skill claims contradiction, never speed', () => {
  assert.match(body(), /contradiction, not speed/i);
  assert.doesNotMatch(body(), /\b(faster|speed-?up|quicker|save[sd]? time)\b/i);
});

test('fleet skill states the boundary: distributed by casp, not part of CASP', () => {
  const text = body();
  assert.match(text, /not part of (the )?CASP/i);
  assert.match(text, /launches sessions/i);
  assert.match(text, /no `?casp check`? rule reads/i);
});
