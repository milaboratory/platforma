/** Test script for creating sparse files on any OS. It also checks if they was created on Windows.
 * Usage: node script.js <dir where to create a file>
 * Works on any node >= 18.0.0 */

const { exec } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const fs = require('node:fs/promises');

const testDir = path.resolve(process.argv[2]);
const baseFileName = 'sparse-test-file.dat';
const logicalFileSize = 50 * 1024 * 1024; // 50 MB

async function ensureDir(dirPath) {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

async function cleanupFile(filePath) {
  try {
    await fs.access(filePath);
    await fs.unlink(filePath);
  } catch {
    // File doesn't exist or already removed, ignore
  }
}

const asyncExec = promisify(exec);

async function runCommand(commandAndArgs, options) {
  try {
    const { stdout, stderr } = await asyncExec(commandAndArgs.join(' '), options);

    return { stdout: stdout?.toString(), stderr: stderr?.toString() };
  } catch (error) {
    // execFile promisified version throws an error that includes stdout and stderr
    console.error(
      `Command "${commandAndArgs.join(' ')}" failed: ${error.message}`
    );
    console.error(`STDOUT: ${error.stdout}`);
    console.error(`STDERR: ${error.stderr}`);
    throw error; // Re-throw to be caught by the calling function
  }
}

async function createSparseFile(
  platform,
  currentFilePath,
  size
) {
  try {
    await ensureDir(path.dirname(currentFilePath));
    await cleanupFile(currentFilePath); // Clean up if file exists

    let fileHandle;

    fileHandle = await fs.open(currentFilePath, 'w');
    await fileHandle.close(); // Close before calling fsutil
    fileHandle = undefined; // Reset handle

    if (platform === 'win32') {
      console.log(
        `Windows: File "${currentFilePath}" created/truncated to ${size} bytes.`
      );
      await runCommand(['fsutil', 'sparse', 'setflag', `"${currentFilePath}"`], { stdio: 'pipe' });
      console.log(`Windows: File "${currentFilePath}" marked as sparse.`);
    }

    // Write data with gaps to demonstrate sparse nature
    fileHandle = await fs.open(currentFilePath, 'r+');
    const initialData = Buffer.from(`BEGIN_SPARSE_${platform.toUpperCase()}_`);
    await fileHandle.write(initialData, 0, initialData.length, 0);

    const distantData = Buffer.from(`_END_SPARSE_${platform.toUpperCase()}`);
    const distantOffset = size - distantData.length - 200;
    await fileHandle.write(
      distantData,
      0,
      distantData.length,
      distantOffset
    );

    await fileHandle.close();
    console.log(`Initial and distant data written to "${currentFilePath}".`);
    return true;
  } catch (error) {
    console.error(
      `Error in createSparseFile for ${platform} at "${currentFilePath}": ${error.message}`
    );
    return false;
  }
}

(async () => {
  const currentPlatform = process.platform;
  const platformFilePath = path.join(
    testDir,
    `${currentPlatform}-${baseFileName}`
  );

  const creationSuccess = await createSparseFile(
    currentPlatform,
    platformFilePath,
    logicalFileSize
  );

  if (creationSuccess) {
    console.log(`Sparse file created successfully at "${platformFilePath}".`);
  } else {
    console.error(`Failed to create sparse file at "${platformFilePath}".`);
  }

  if (currentPlatform === 'win32') {
    const queryFlag = await runCommand(['fsutil', 'sparse', 'queryflag', `"${platformFilePath}"`], { stdio: 'pipe' });
    console.log(`Windows: File "${platformFilePath}" is sparse: ${queryFlag.stdout}, error: ${queryFlag.stderr}`);

    const queryRange = await runCommand(['fsutil', 'sparse', 'queryrange', `"${platformFilePath}"`], { stdio: 'pipe' });
    console.log(`Windows: Query range for "${platformFilePath}": ${queryRange.stdout}, error: ${queryRange.stderr}`);
  }
})();
