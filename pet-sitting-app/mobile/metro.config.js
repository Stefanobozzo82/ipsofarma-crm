// Monorepo pnpm: le dipendenze non dichiarate direttamente da mobile/package.json
// (es. @babel/runtime, richiesto dagli helper di interop CommonJS che Babel
// inietta in ogni file transpilato) vivono nello store pnpm sotto la root del
// workspace e arrivano in mobile/node_modules solo come symlink. Metro non
// segue i symlink di default — senza questa config fallisce con
// "Unable to resolve module @babel/runtime/..." al primo bundle, sia web che
// nativo (Expo Go/dev client), non solo in questo test headless.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

config.resolver.unstable_enableSymlinks = true;
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
