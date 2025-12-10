const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function formatWidth(text, width) {
  if (text.length > width) {
    return text.slice(0, width);
  }
  return ' '.repeat(width - text.length) + text;
}

const ignoreList = ['node_modules', '.turbo', 'dist'];

const scriptDir = __dirname;
process.chdir(scriptDir);

// List all directories in the current directory to detect output alignment
var width = 0;
const directories = fs.readdirSync(scriptDir).filter((item) => {
  const isDir = fs.statSync(path.join(scriptDir, item)).isDirectory()
  if (ignoreList.includes(item)) {
    return false;
  }

  if (isDir) {
    width = Math.max(width, item.length);
  }
  return isDir;
});

process.stdout.write(`Installing dependencies...\n`);
// We have to keep test pacakges to be part of pnpm-workspace.yaml.
// Otherwise they would not get node_modules at install step and will not be able to build.
// We can't use plain 'npm' instead of 'pnpm', as it does not know what 'catalog:' and 'workspace:' are
// (which are used in package.json of package-builder)
execSync('pnpm install', { cwd: path.join(scriptDir), stdio: 'pipe' })

process.stdout.write(`Running package builder integration tests...\n`);
directories.forEach((directory) => {
  try {
    process.stdout.write(`  ${formatWidth(directory, width)}: `);

    // We can't use 'build' or 'test' in test packages as it would be started by turbo.
    // Packages depend on each-other. Turbo might run build/test steps independently for packages
    // because of caching.
    execSync('pnpm run check', { cwd: path.join(scriptDir, directory), stdio: 'pipe' });

    process.stdout.write(`OK\n`);
  } catch (error) {
    process.stdout.write('FAIL\n');

    console.error(`\nPackage builder test '${directory}' failed:`);
    console.error('==================== process stdout ====================');
    console.error(error.stdout.toString());
    console.error('\n');
    
    console.error('==================== process stderr ====================');
    console.error(error.stderr.toString());
    console.error('\n');

    process.exit(1)
  }
});
