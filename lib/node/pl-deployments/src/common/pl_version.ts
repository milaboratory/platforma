import packageJson from '../../package.json';

export function getDefaultPlVersion(): string {
  // drop build error if pl-version is not defined
  return packageJson['pl-version'];
}
