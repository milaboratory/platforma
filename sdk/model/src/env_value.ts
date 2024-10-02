declare global {
  function getEnvironmentValue(name: string): string | undefined;
}

export function getEnvironmentValue(name: string): string | undefined {
  if (typeof getEnvironmentValue !== 'function') return undefined;
  else return getEnvironmentValue(name);
}
