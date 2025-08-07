import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

export function getCurrentDir(): string {
  const __filename = fileURLToPath(import.meta.url);
  return dirname(__filename);
}

export function getConfigsDir(): string {
  return join(getCurrentDir(), '../../configs');
}

export function getConfigPath(filename: string): string {
  return join(getConfigsDir(), filename);
}
