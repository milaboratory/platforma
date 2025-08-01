function getRandomInt(min: number, max: number) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min)) + min;
}

export function camelToKebab(str: string) {
  str = str.replace(' ', '-');
  return (str[0] || '').toLowerCase() + str.slice(1).replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`);
}

export function trimChars(str: string, chars: string[] = []) {
  str = str ? String(str) : '';
  while (chars.includes(str.charAt(0))) str = str.substr(1);
  while (chars.includes(str.charAt(str.length - 1))) str = str.substr(0, str.length - 1);
  return str;
}

export function trimCharsLeft(str: string, chars: string[] = []) {
  str = str ? String(str) : '';
  while (chars.includes(str.charAt(0))) str = str.substring(1);
  return str;
}

export function extractFileName(filePath: string) {
  return filePath.replace(/^.*[\\/]/, '');
}

export function extractExtension(fileName: string) {
  return fileName.replace(/^.*?[.]/, '');
}

// @TODO move from here
export function extractPaths(e: DragEvent, extensions?: string[]) {
  const paths: string[] = [];

  if (e.dataTransfer) {
    for (let i = 0; i < e.dataTransfer.items.length; i++) {
      if (e.dataTransfer.items[i].kind !== 'file') {
        continue;
      }
      const file = e.dataTransfer.items[i].getAsFile() as (File & { path: string }) | null; // @TODO electron specific
      if (file && file.path) {
        paths.push(file.path);
      }
    }
  }

  if (extensions) {
    return paths.filter((p) => extensions.includes(extractExtension(extractFileName(p))));
  }

  return paths;
}

export const pluralize = (count: number, noun: string, suffix = 's') => `${count} ${noun}${count !== 1 ? suffix : ''}`;

export function isRegexpValid(exp: string) {
  try {
    new RegExp(exp);
    return true;
  } catch (_e) {
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

export function uniqueId(length: number = 42) {
  return randomString(length);
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

export function hashCode(str: string) {
  let hash = 0, i, chr;
  if (str.length === 0) return hash;
  for (i = 0; i < str.length; i++) {
    chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}
