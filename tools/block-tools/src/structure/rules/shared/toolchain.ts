// The SDK monorepo's Node, pnpm, and pnpm settings for blocks; `toolchain.test.ts` checks the match.

/** Node version for the block CI workflows. */
export const NODE_VERSION = "24.22.1";

/** Root `engines.node` of a block. */
export const NODE_ENGINE = `>=${NODE_VERSION.split(".")[0]}`;

/** Root `packageManager` of a block. The shared CI workflow installs this pnpm. */
export const PACKAGE_MANAGER =
  "pnpm@12.16.1+sha512.091d1dee7927575661b25dab3c2ae31cafc1c54d6b71ed6a6600cf0c1cb10434a447eae14015f1b23e2e6bedeed79df94a932e2164d2832280dce3fb32f656d1";

/** turbo before 2.11 cannot parse a pnpm 12 lockfile. */
export const TURBO_VERSION = "~2.11.10";

/** Our scopes skip `minimumReleaseAge`, so `upgrade-sdk` gets a fresh SDK release. */
export const MINIMUM_RELEASE_AGE_EXCLUDE: readonly string[] = [
  "@milaboratories/*",
  "@platforma-sdk/*",
  "@platforma-open/*",
];

/** pnpm 11+ fails an install on an unlisted install script. This one downloads the native addon. */
export const REQUIRED_BUILDS: Record<string, boolean> = {
  "@milaboratories/pframes-rs-node": true,
};

/** Install scripts in the SDK tree that only clean up, print, or build optional native code. */
export const SKIPPED_BUILDS: Record<string, boolean> = {
  "@milaboratories/tengo-tester": false,
  "cpu-features": false,
  esbuild: false,
  protobufjs: false,
  ssh2: false,
};
