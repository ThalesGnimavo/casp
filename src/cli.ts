#!/usr/bin/env -S npx tsx
/**
 * cockpit — a 200-line discipline for AI-coding sessions.
 *
 * https://thalesandhisaictoclaude.com
 * MIT License.
 */

import { argv, exit } from 'node:process';
import { runInit } from './init.ts';
import { runCheck } from './check.ts';
import { runStatus } from './status.ts';
import { runNew } from './new.ts';

const VERSION = '0.1.0';

const HELP = `
cockpit ${VERSION} — a 200-line discipline for AI-coding sessions

USAGE
  cockpit <command> [options]

COMMANDS
  init                          Scaffold cockpit/ in the current directory
  status                        Print one-screen snapshot (use --plain for no color)
  check                         Validate state.json against filesystem + git
  check --quiet                 Same, suppress output unless FAIL
  new prompt --slug <kebab-id>  Copy session-prompt template to docs/plan/sessions/
  new log --slug <kebab-id>     Copy session-log template to session-logs/

GLOBAL
  -h, --help                    Print this help
  -V, --version                 Print version

EXAMPLES
  cockpit init                  # in a fresh repo
  cockpit status                # at session start
  cockpit check                 # before git push
  cockpit new prompt --slug phase-2-auth-flow

LEARN MORE
  https://github.com/justethales/cockpit-skill
  https://thalesandhisaictoclaude.com
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
