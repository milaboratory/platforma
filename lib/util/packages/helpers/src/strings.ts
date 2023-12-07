function getRandomInt(min: number, max: number) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min)) + min;
}

export function camelToKebab(str: string) {
  str = str.replace(' ', '-');
  return (str[0] || '').toLowerCase() + str.slice(1).replace(/[A-Z]/g, l => `-${l.toLowerCase()}`);
}

export function trimChars(str: string, chars: string[] = []) {
  str = str ? String(str) : '';
  while (chars.includes(str.charAt(0))) str = str.substr(1);
  while (chars.includes(str.charAt(str.length - 1))) str = str.substr(0, str.length - 1);
  return str;
}

export function extractFileName(filePath: string) {
  return filePath.replace(/^.*[\\/]/, '');
}

export function extractExtension(fileName: string) {
  return fileName.replace(/^.*?[.]/, '');
}

export function isRegexpValid(exp: string) {
  try {
    new RegExp(exp);
    return true;
  } catch(e) {
    return false;
  }
}

export function ucFirst(str: string) {
  if (!str) {
    return '';
  }
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function lcFirst(str: string) {
  if (!str) {
    return '';
  }
  return str.charAt(0).toLowerCase() + str.slice(1);
}

export function randomString(length: number) {
  let s = '';
  for (let i = 0; i < length; i++) {
    s += String.fromCharCode(getRandomInt(65, 91));
  }
  return s;
}

export function uniqueId() {
  return randomString(42);
}

export function before(str: string, sub: string) {
  return str.substring(0, str.indexOf(sub));
}

export function beforeLast(str: string, sub: string) {
  return str.substring(0, str.lastIndexOf(sub));
}

export function after(str: string, sub: string) {
  return str.substring(str.indexOf(sub) + sub.length, str.length);
}

export function assertString(v: unknown): asserts v is string {
  if (typeof v !== 'string') {
    throw Error('Expect string value, got: ' + typeof v);
  }
}
