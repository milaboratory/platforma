import fs from 'fs/promises';

async function getPackageJson() {
  const packageJson = await fs.readFile('package.json');
  return JSON.parse(packageJson.toString());
}

export async function getPlVersion(): Promise<string> {
  return (await getPackageJson())['pl-version'];
}
