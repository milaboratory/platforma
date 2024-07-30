import * as fs from 'fs';

const packageLockPath = './package-lock.json';

fs.readFile(packageLockPath, 'utf8', (err, data) => {
  if (err) {
    console.error(`Error reading ${packageLockPath}:`, err);
    process.exit(1);
  }

  // Check for local file references
  if (data.includes('"file:')) {
    console.error('Error: package-lock.json contains local file references. Please remove them before committing.');
    process.exit(1);
  }

  console.log('package-lock.json is clean. Ready to commit!');
});
