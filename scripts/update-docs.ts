/**
 * Sync README.md's version line from root package.json (the single source of
 * truth). build-lib copies this README into dist_module, so the repo and
 * published package share the same document.
 *
 * Adapted from Unirend's scripts/update-readme-version.ts. Run via
 * `bun run update-docs` (also runs as part of build:lib).
 */
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dir, '..');

const pkg = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')
) as { version: string };

const readmePath = path.join(rootDir, 'README.md');
let readme = fs.readFileSync(readmePath, 'utf8');

// Stamp the version into the H1, e.g. "# Form Context React Zod v1.2.3".
const baseTitle = '# Form Context React Zod';
const titleWithVersion = new RegExp(
  `^${baseTitle} v\\d+\\.\\d+\\.\\d+\\S*`,
  'm'
);
const newTitle = `${baseTitle} v${pkg.version}`;

if (titleWithVersion.test(readme)) {
  readme = readme.replace(titleWithVersion, newTitle);
} else if (new RegExp(`^${baseTitle}$`, 'm').test(readme)) {
  // No version stamped yet — add it to the base title.
  readme = readme.replace(new RegExp(`^${baseTitle}$`, 'm'), newTitle);
} else {
  console.warn(
    `⚠️ update-docs: no "${baseTitle}" H1 found in README.md; nothing to sync`
  );
  process.exit(0);
}

fs.writeFileSync(readmePath, readme);
console.log(`✅ update-docs: README.md title -> ${newTitle}`);
