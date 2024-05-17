import { ResourceType } from './types';

function rt(name: string, version: string): ResourceType {
  return { name, version };
}

export const ClientRoot = rt('ClientRoot', '1');

export const StructTestResource = rt('StructTest', '1');
export const ValueTestResource = rt('ValueTest', '1');

export const JsonString = rt('json/string', '1');
export const JsonBool = rt('json/bool', '1');
export const JsonObject = rt('json/object', '1');
export const JsonArray = rt('json/array', '1');
export const JsonNumber = rt('json/number', '1');
export const JsonNull = rt('json/null', '1');
