// The library is linked via `file:../../dist_module` (a symlink that points
// OUTSIDE this project folder). Metro only follows symlinks into paths it
// watches, so add dist_module to watchFolders. That's the only customization —
// everything else uses Expo's defaults (package-exports resolution included).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.watchFolders = [path.resolve(__dirname, '../../dist_module')];

// The library exposes subpaths (`./devtools/native`, `./web`, `./context`) via
// the package `exports` map. Metro on this SDK doesn't resolve `exports` by
// default, so enable it (otherwise only the main `.` entry resolves).
config.resolver.unstable_enablePackageExports = true;

// dist_module lives outside the app, so when the library's bundles import their
// peers (`react`, `react-native`, `zod`) Metro would resolve them relative to
// dist_module instead of the app. Pin them to THIS app's node_modules so there's
// a single copy of each (newer Metro does this automatically for symlinked deps).
config.resolver.extraNodeModules = {
  react: path.resolve(__dirname, 'node_modules/react'),
  'react-native': path.resolve(__dirname, 'node_modules/react-native'),
  zod: path.resolve(__dirname, 'node_modules/zod'),
  // The lib's bundles self-import the shared-context subpath
  // (`form-context-react-zod/context`); pin the package name to dist_module so
  // that external reference resolves from inside dist_module too.
  'form-context-react-zod': path.resolve(__dirname, '../../dist_module'),
};

module.exports = config;
