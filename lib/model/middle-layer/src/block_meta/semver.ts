import * as v from "valibot";

// Regex taken from here:
//   https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string
export const SemVer = v.pipe(
  v.string(),
  v.regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/,
    "Wrong version format, please use valid semver",
  ),
);
