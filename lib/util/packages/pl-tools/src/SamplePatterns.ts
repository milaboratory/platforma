import {strings, objects, utils} from '@milaboratory/helpers';
import {Arranged} from './types';
import {sequence} from '@milaboratory/sequences';

const {trimChars, isRegexpValid, extractFileName} = strings;
const {omit, setProp} = objects;
const {iterateByPairs} = utils;

function escapeRegExp(string: string) {
  return string ? string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : '';
}

export default {
  compilePattern(pattern: string) {
    const tagPattern = /({{[A-Za-z_\d*]*?}})/g;

    const matches = sequence(pattern.matchAll(tagPattern)).map(m => ({
      first: m.index ?? 0,
      last: (m.index ?? 0) + m[0].length,
      name: trimChars(m[0], ['{', '}'])
    })).toArray();

    matches.unshift({
      first: 0,
      last: 0,
      name: ''
    });

    matches.push({
      first: pattern.length,
      last: pattern.length,
      name: ''
    });

    const parts: string[] = [];

    for (const [m, next] of iterateByPairs(matches)) {
      const {name} = m;

      const between = pattern.substring(m.last, next.first);

      if (!m.name) {
        parts.push('');
      } else if (name === '*') {
        parts.push(String.raw`(.*?)`); // lazy?
      } else {
        parts.push(String.raw`(?<${name}>.*)`);
      }

      parts.push(escapeRegExp(between));
    }

    return '^' + parts.join('') + '$';
  },
  arrangeFiles(filePaths: string[], pattern: string): Arranged[] {
    const regExp = this.compilePattern(pattern);

    const isRegexValid = isRegexpValid(regExp);

    return filePaths.map(filePath => {
      const fileName = extractFileName(filePath);

      const match = isRegexValid ? fileName.match(regExp) : null;

      const groups = match?.groups ?? {};

      return {
        fileName,
        filePath,
        Sample: groups.Sample,
        R: groups.R,
        tags: omit(groups, 'Sample', 'R'),
        valid: isRegexValid,
        hasMatch: !!(groups.Sample && groups.R)
      };
    });
  },
  filterValid(arranged: Arranged[]) {
    const dict = arranged.reduce((v, a) => {
      if (!a.Sample || !a.R) {
        return v;
      }
      return setProp(v, a.Sample, [...v[a.Sample] || [], a.R]);
    }, {} as Record<string, string[]>);

    return arranged.filter(a => {
      if (!a.valid || !a.hasMatch) {
        return false;
      }

      return dict[a.Sample].includes('R1');
    });
  }
};
