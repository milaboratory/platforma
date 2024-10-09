import fs from 'fs/promises';
import path from 'path';

async function getPackageJson() {
  const packageJson = await fs.readFile(path.join(__dirname, '..', 'package.json'));
  return JSON.parse(packageJson.toString());
}

export async function getPlVersion(): Promise<string> {
  return (await getPackageJson())['pl-version'];
}
