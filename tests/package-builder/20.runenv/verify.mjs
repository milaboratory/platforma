import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Verify, that:
// - dist/tengo/software has java.sw.json, python.sw.json and r.sw.json files
// - that python.sw.json has content: '3.12.10', 'MY_ENV_VAR=1234' and 'python'
// - that java.sw.json has content: '21', 'envVars:[]', 'java'
// - that r.sw.json has content: '4.3.1', 'envVars:[]', 'R'
// - that all files are valid JSON

const baseDir = './dist/tengo/software';
const files = ['java.sw.json', 'python.sw.json', 'r.sw.json'];

function verifyFileExists(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`File does not exist: ${filePath}`);
  }
  console.log(`✓ File exists: ${filePath}`);
}

function verifyValidJSON(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(content);
    console.log(`✓ Valid JSON: ${filePath}`);
    return parsed;
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}: ${error.message}`);
  }
}

function verifyPythonContent(data) {
  const { runEnv } = data;

  if (runEnv.type !== 'python') {
    throw new Error(`Expected type 'python', got '${runEnv.type}'`);
  }

  if (runEnv['python-version'] !== '3.12.10') {
    throw new Error(`Expected python-version '3.12.10', got '${runEnv['python-version']}'`);
  }

  if (!runEnv.envVars.includes('MY_ENV_VAR=1234')) {
    throw new Error(`Expected envVars to contain 'MY_ENV_VAR=1234', got ${JSON.stringify(runEnv.envVars)}`);
  }

  console.log('✓ Python content verification passed');
}

function verifyJavaContent(data) {
  const { runEnv } = data;

  if (runEnv.type !== 'java') {
    throw new Error(`Expected type 'java', got '${runEnv.type}'`);
  }

  if (runEnv['java-version'] !== '21') {
    throw new Error(`Expected java-version '21', got '${runEnv['java-version']}'`);
  }

  if (JSON.stringify(runEnv.envVars) !== '[]') {
    throw new Error(`Expected envVars to be [], got ${JSON.stringify(runEnv.envVars)}`);
  }

  console.log('✓ Java content verification passed');
}

function verifyRContent(data) {
  const { runEnv } = data;

  if (runEnv.type !== 'R') {
    throw new Error(`Expected type 'R', got '${runEnv.type}'`);
  }

  if (runEnv['r-version'] !== '4.3.1') {
    throw new Error(`Expected r-version '4.3.1', got '${runEnv['r-version']}'`);
  }

  if (JSON.stringify(runEnv.envVars) !== '[]') {
    throw new Error(`Expected envVars to be [], got ${JSON.stringify(runEnv.envVars)}`);
  }

  console.log('✓ R content verification passed');
}

function main() {
  try {
    console.log('Starting verification...');

    // Verify all files exist
    for (const file of files) {
      const filePath = join(baseDir, file);
      verifyFileExists(filePath);
    }

    // Verify and parse JSON files
    const pythonPath = join(baseDir, 'python.sw.json');
    const pythonData = verifyValidJSON(pythonPath);
    verifyPythonContent(pythonData);

    const javaPath = join(baseDir, 'java.sw.json');
    const javaData = verifyValidJSON(javaPath);
    verifyJavaContent(javaData);

    const rPath = join(baseDir, 'r.sw.json');
    const rData = verifyValidJSON(rPath);
    verifyRContent(rData);

    console.log('✅ All software artifacts are valid.');
    process.exit(0);

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    process.exit(1);
  }
}

main();
