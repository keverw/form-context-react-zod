// Build script for form-context-react-zod library.
// Run from the repo root via `bun run scripts/build-lib.ts` (paths are cwd-relative).
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

// Single source of truth: read metadata from the root package.json so the
// published manifest stays in sync with one place.
const rootPkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

const PACKAGE_CONFIG = {
  name: rootPkg.name,
  version: rootPkg.version,
  description: rootPkg.description,
  author: rootPkg.author,
  license: rootPkg.license,
  homepage: rootPkg.homepage,
  repository: rootPkg.repository,
  bugs: rootPkg.bugs,
  keywords: rootPkg.keywords,
};

// Clean dist_module directory
console.log('Cleaning dist_module directory...');
if (fs.existsSync('dist_module')) {
  try {
    // Remove the entire directory and its contents
    fs.rmSync('dist_module', { recursive: true, force: true });
    console.log('✅ Cleaned dist_module directory');
  } catch (error) {
    console.error('❌ Error cleaning dist_module directory:', error);
    process.exit(1);
  }
}

// Ensure dist_module directory exists
if (!fs.existsSync('dist_module')) {
  fs.mkdirSync('dist_module', { recursive: true });
}

async function build() {
  try {
    // Build the library with tsup (bundles JS and generates type declarations)
    console.log('Building library with tsup...');
    try {
      // Use tsup with config file for JSX support
      console.log('Running tsup with config file...');
      // No --out-dir: each entry sets its own outDir (dist_module/<entry>), so
      // every pass can clean its own folder without clobbering siblings.
      execSync(
        'bunx tsup --config tsup.config.ts --tsconfig tsconfig.lib.json',
        {
          stdio: 'inherit',
        }
      );

      console.log('✅ Library built successfully with tsup');
    } catch (error) {
      console.error('❌ Error building library with tsup:', error);
      process.exit(1); // Exit if tsup fails since we no longer have esbuild as fallback
    }

    // Copy documentation files
    console.log('Copying documentation files...');
    try {
      if (fs.existsSync('README.md')) {
        fs.copyFileSync('README.md', 'dist_module/README.md');
      }

      if (fs.existsSync('docs')) {
        fs.cpSync('docs', 'dist_module/docs', { recursive: true });
      }

      console.log('✅ Documentation files copied successfully');
    } catch (error) {
      console.error('❌ Error copying documentation files:', error);
      // Continue anyway
    }

    // Create package.json for the library (metadata pulled from root package.json)
    console.log('Creating package.json for publishing...');

    // Modify package.json for the library
    const libPackageJson = {
      name: PACKAGE_CONFIG.name,
      version: PACKAGE_CONFIG.version,
      description: PACKAGE_CONFIG.description,
      author: PACKAGE_CONFIG.author,
      license: PACKAGE_CONFIG.license,
      homepage: PACKAGE_CONFIG.homepage,
      repository: PACKAGE_CONFIG.repository,
      bugs: PACKAGE_CONFIG.bugs,
      keywords: PACKAGE_CONFIG.keywords,
      type: 'module',
      // ESM-only package: no `main`/`require` (CJS) entry points. The
      // split-context architecture could emit CJS too, but we publish only ESM.
      module: './core/index.js',
      types: './core/index.d.ts',
      exports: {
        '.': {
          import: { types: './core/index.d.ts', default: './core/index.js' },
        },
        './web': {
          import: { types: './web/index.d.ts', default: './web/index.js' },
        },
        './devtools/web': {
          import: {
            types: './devtools/web/index.d.ts',
            default: './devtools/web/index.js',
          },
        },
        './devtools/native': {
          import: {
            types: './devtools/native/index.d.ts',
            default: './devtools/native/index.js',
          },
        },
        // Shared React contexts. Kept as a real subpath so every entry resolves
        // to ONE instance at runtime (see tsup.config.ts). Mostly internal, but
        // exported so the redirect target resolves for consumers.
        './context': {
          import: {
            types: './context/index.d.ts',
            default: './context/index.js',
          },
        },
      },
      // Explicit per-entry files (no sourcemaps in the published tarball).
      files: [
        'core/index.js',
        'core/index.d.ts',
        'web/index.js',
        'web/index.d.ts',
        'devtools/web/index.js',
        'devtools/web/index.d.ts',
        'devtools/native/index.js',
        'devtools/native/index.d.ts',
        'context/index.js',
        'context/index.d.ts',
        'README.md',
        'docs/form-api.md',
        'docs/zod-helpers.md',
      ],
      // Peers come from root package.json (validated by check-deps). react-dom
      // is an OPTIONAL peer — no published bundle imports it (the core is
      // DOM-free / RN-friendly; FormState renders host elements the consumer's
      // renderer provides), so React Native consumers aren't told to install it.
      peerDependencies: rootPkg.peerDependencies,
      peerDependenciesMeta: rootPkg.peerDependenciesMeta,
      dependencies: {},
      // ESM-only: declare the Node floor so npm warns on unsupported versions.
      engines: rootPkg.engines,
    };

    fs.writeFileSync(
      path.join('dist_module', 'package.json'),
      JSON.stringify(libPackageJson, null, 2)
    );

    console.log(
      '✅ Library build complete! Your package is ready in the dist_module directory.'
    );
    console.log('To publish:');
    console.log('1. Run bun run publish:lib');
    console.log('   OR');
    console.log('2. cd dist_module && bun publish');
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

build();
