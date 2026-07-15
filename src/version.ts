/**
 * `casp version [--json]` — the machine-readable version handoff.
 *
 * The plain form prints the version string, byte-identical to `casp -V` /
 * `casp --version` (which short-circuit earlier in cli.ts and stay unchanged).
 * `--json` emits a small stable object for the agent-to-agent handoff:
 *   { name, version, node, schema_version }
 * where `schema_version` is the `casp check --json` report schema version, so a
 * consumer can negotiate the check-report shape from one call. No network, no
 * LLM — static data, like the rest of the binary.
 */

import { exit } from 'node:process';
import { pkgName, pkgVersion } from './shared.js';
import { JSON_SCHEMA_VERSION } from './check.js';

export function runVersion(args: string[]): void {
  if (args.includes('--json')) {
    console.log(
      JSON.stringify(
        {
          name: pkgName(),
          version: pkgVersion(),
          node: process.version,
          schema_version: JSON_SCHEMA_VERSION
        },
        null,
        2
      )
    );
    exit(0);
  }
  console.log(pkgVersion());
  exit(0);
}
