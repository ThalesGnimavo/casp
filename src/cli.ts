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
import { runShip } from './ship.js';
import { runClose } from './close.js';
import { pkgVersion } from './shared.js';

const VERSION = pkgVersion();

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
  check --json                  Same checks, machine-readable JSON report (stable schema)
  check --all [root]            Validate every casp/ cockpit under a root, one report
  next                          Print the next session's prompt from state.next_prompt
  ship <slug>                   Mark a phase shipped: flip prompt to shipped, wire log,
                                  move slug queued → shipped (no git)
  close                         Bump last_commit / last_session_id from HEAD + newest log,
                                  then run check (no git)
  new prompt --slug <kebab-id>  Copy session-prompt template to the sessions dir
                                  (default docs/plan/sessions; set sessions_dir to override)
  new log --slug <kebab-id>     Copy session-log template to the logs dir
                                  (default session-logs; set logs_dir to override)

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
  https://casp.sh
  https://github.com/ThalesGnimavo/casp
`;

async function main(): Promise<void> {
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
    case 'ship':
      runShip(rest);
      break;
    case 'close':
      await runClose(rest);
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
