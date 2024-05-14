import { ResourceType } from './types';

function rt(name: string, version: string): ResourceType {
  return { name, version };
}

export const ClientRoot = rt('ClientRoot', '1');

export const StructTestResource = rt('StructTest', '1');
export const ValueTestResource = rt('ValueTest', '1');

export const JsonString = rt('json/string', '1');
