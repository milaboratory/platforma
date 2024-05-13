import { PlResourceType } from './types';

function rt(name: string, version: string): PlResourceType {
  return { name, version };
}

export const ClientRoot = rt('ClientRoot', '1');
