import {strings} from '@milaboratory/helpers';
import {Arranged} from './types';

export default {
  createPattern(pattern: string) {
    const tagPattern = /({{[A-Za-z_\d*]*?}})/g;

    const compiled = pattern.replaceAll(tagPattern, function (match) {
      const name = strings.trimChars(match, ['{', '}']);

      if (name === '*') {
        return String.raw`(.*?)`;
      }

      if (name === 'R') {
        return String.raw`(?<${name}>(R|I)(1|2)*?)`;
      }

      return String.raw`(?<${name}>.*?)`;
    });

    return '^' + compiled + '$';
  },
  arrangeFiles(filePaths: string[], pattern: string): Arranged[] {
    const regExp = this.createPattern(pattern);

    const isValid = strings.isRegexpValid(regExp);

    return filePaths.map(filePath => {
      const fileName = strings.extractFileName(filePath);
      const match = isValid ? fileName.match(regExp) : null;

      const groups = match?.groups;

      return {
        fileName,
        filePath,
        groups: groups ?? null
      };
    });
  }
};
