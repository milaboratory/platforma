import type { Cfg } from '@platforma-sdk/model';
import { traverseCfg } from './traverse';

export function mapRecord<T1, T2, Key extends string>(
  obj: Record<Key, T1>,
  mapper: (value: T1) => T2,
): Record<Key, T2> {
  const result = {} as Record<Key, T2>;
  for (const [key, value] of Object.entries(obj)) result[key as Key] = mapper(value as T1);
  return result;
}

export function ifNotUndef<T, R>(value: T | undefined, cb: (value: T) => R): R | undefined {
  return value === undefined ? undefined : cb(value);
}

function isActiveCfg(cfg: Cfg): boolean {
  switch (cfg.type) {
    case 'GetImportProgress':
      return true;
    default:
      return false;
  }
}

export function hasActiveCfgComponents(cfg: Cfg): boolean {
  for (const nested of traverseCfg(cfg)) if (isActiveCfg(nested)) return true;
  return false;
}
