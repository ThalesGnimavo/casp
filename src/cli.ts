#!/usr/bin/env node
/**
 * casp — the Coding-Agent State Protocol.
 *
 * A git-native, local-only state file every AI coding agent can read, plus a
 * validator that blocks the push the moment your project drifts.
 *
 * https://github.com/ThalesGnimavo/casp
 * MIT License.
 */

import { argv, exit } from 'node:process';
import { runInit } from './init.js';
import { runCheck } from './check.js';
import { runStatus } from './status.js';
import { runNew } from './new.js';
import { runNext } from './next.js';

const VERSION = '0.2.0';

const HELP = `
casp ${VERSION} — the Coding-Agent State Protocol

The protocol that refuses to let your state lie: a git-native, local-only state
file every AI coding agent can read, plus a validator that blocks the push the
moment your project drifts.

USAGE
  casp <command> [options]

COMMANDS
  init                          Scaffold the casp/ continuity layer in this repo
  status                        Print one-screen snapshot (use --plain for no color)
  check                         Validate state.json against git — exits 1 on drift
  check --quiet                 Same, suppress output unless FAIL (CI-friendly)
  next                          Print the next session's prompt from state.next_prompt
  new prompt --slug <kebab-id>  Copy session-prompt template to docs/plan/sessions/
  new log --slug <kebab-id>     Copy session-log template to session-logs/

GLOBAL
  -h, --help                    Print this help
  -V, --version                 Print version

EXAMPLES
  casp init                     # in a fresh repo
  casp status                   # at session start
  casp check                    # before git push — mandatory, blocks on drift
  casp next                     # surface the exact next move
  casp new prompt --slug phase-2-auth-flow

LEARN MORE
  https://casp.dev
  https://github.com/ThalesGnimavo/casp
`;

function main(): void {
  const args = argv.slice(2);

  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    console.log(HELP);
    exit(0);
  }
  if (args.includes('-V') || args.includes('--version')) {
    console.log(VERSION);
    exit(0);
  }

  const [cmd, ...rest] = args;

  switch (cmd) {
    case 'init':
      runInit(rest);
      break;
    case 'status':
      runStatus(rest);
      break;
    case 'check':
      runCheck(rest);
      break;
    case 'next':
      runNext(rest);
      break;
    case 'new':
      runNew(rest);
      break;
    default:
      console.error(`unknown command: ${cmd}\n`);
      console.log(HELP);
      exit(1);
  }
}

main();
