import { z } from 'zod';

export const PlRegAddress = z.string().regex(/^(?:s3:|file:)/);

// Regex taken from here:
//   https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string
export const SemVer = z
  .string()
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/,
    'Wrong version format, please use valid semver'
  );
