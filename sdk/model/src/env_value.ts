import {} from './global';

export function getEnvironmentValue(name: string): string | undefined {
  if (typeof globalThis.getEnvironmentValue !== 'function') return undefined;
  else return globalThis.getEnvironmentValue(name);
}
