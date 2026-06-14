/**
 * Validate that every published peerDependency is something we actually develop
 * and test against locally. The published peers (root package.json's
 * `peerDependencies`, which build-lib copies into the published manifest) must be
 * satisfied by the versions in this repo's dependencies / devDependencies — so we
 * never tell consumers to use a range we don't exercise.
 *
 * Adapted from Unirend's scripts/check-deps.ts (which also validates a starter
 * template; this package has none, so we only check peers vs local deps).
 */
import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';

const rootDir = path.resolve(import.meta.dir, '..');

const pkg = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')
) as {
  peerDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const peers = pkg.peerDependencies ?? {};
const installed = {
  ...(pkg.dependencies ?? {}),
  ...(pkg.devDependencies ?? {}),
};

/**
 * Does the minimum version of `candidateRange` satisfy `requiredRange`?
 * Used to confirm the version we develop against is compatible with the peer range.
 */
function isCompatible(requiredRange: string, candidateRange: string): boolean {
  try {
    const min = semver.minVersion(candidateRange);
    return min ? semver.satisfies(min, requiredRange) : false;
  } catch {
    return requiredRange === candidateRange;
  }
}

const errors: string[] = [];

console.log(
  '🔍 check-deps: validating peerDependencies against local deps...\n'
);

for (const [name, peerRange] of Object.entries(peers)) {
  const localRange = installed[name];

  if (!localRange) {
    errors.push(
      `  • ${name}: peerDependency (${peerRange}) is not in dependencies/devDependencies — ` +
        `you're telling consumers to use ${peerRange} but not testing against it`
    );
    continue;
  }

  if (!isCompatible(peerRange, localRange)) {
    errors.push(
      `  • ${name}: testing against ${localRange} but peerDependency says ${peerRange} — ` +
        `these should be compatible`
    );
  }
}

if (errors.length === 0) {
  console.log('✅ check-deps: all peerDependencies are exercised locally\n');
  process.exit(0);
}

console.error('❌ check-deps: peer/dev dependency mismatch:\n');
console.error(errors.join('\n'));
console.error(
  '\n💡 Fix: align package.json peerDependencies with dependencies/devDependencies\n'
);
process.exit(1);
