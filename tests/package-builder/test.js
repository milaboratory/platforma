const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function formatWidth(text, width) {
  if (text.length > width) {
    return text.slice(0, width);
  }
  return ' '.repeat(width - text.length) + text;
}

const scriptDir = __dirname;
process.chdir(scriptDir);

// List all directories in the current directory
var width = 0;
const directories = fs.readdirSync(scriptDir).filter((file) => {
  const isDir = fs.statSync(path.join(scriptDir, file)).isDirectory()
  width = (isDir && width < file.length) ? file.length : width

  return isDir;
});

process.stdout.write(`Running package builder integration tests...\n`);
directories.forEach((directory) => {
  try {
    process.stdout.write(`  ${formatWidth(directory, width)}: `);

    execSync('pnpm install --frozen-lockfile', { cwd: path.join(scriptDir, directory), stdio: 'pipe' })
    execSync('pnpm run build', { cwd: path.join(scriptDir, directory), stdio: 'pipe' });

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
