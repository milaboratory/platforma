export const PL_PKG_VERSION = "PL_PKG_VERSION";
export const PL_PKG_OS = "PL_PKG_OS";
export const PL_PKG_ARCH = "PL_PKG_ARCH";

export const PL_PKG_CONTENT_ROOT = "PL_PKG_CONTENT_ROOT";
export const PL_PKG_ARCHIVE = "PL_PKG_ARCHIVE";
export const PL_PKG_STORAGE_URL = "PL_PKG_STORAGE_URL";

export const PL_PKG_DEV = "PL_PKG_DEV";
export const PL_PKG_FULL_HASH = "PL_PKG_FULL_HASH";

export const PL_CONDA_BUILD = "PL_CONDA_BUILD";
export const PL_CONDA_NO_BUILD = "PL_CONDA_NO_BUILD";

export const PL_DOCKER_REGISTRY = "PL_DOCKER_REGISTRY";
export const PL_DOCKER_REGISTRY_PUSH_TO = "PL_DOCKER_REGISTRY_PUSH_TO";

// Channel binary-upload endpoint overrides. When set on the dev channel, PL_DEV_BINARY_UPLOAD_URL
// is where a dev archive is uploaded AND it flips the embedded registry name midev -> dev.
// PL_RELEASE_BINARY_UPLOAD_URL overrides the release upload endpoint without renaming the registry.
export const PL_DEV_BINARY_UPLOAD_URL = "PL_DEV_BINARY_UPLOAD_URL";
export const PL_RELEASE_BINARY_UPLOAD_URL = "PL_RELEASE_BINARY_UPLOAD_URL";

export const PL_DOCKER_BUILD = "PL_DOCKER_BUILD";
export const PL_DOCKER_NO_BUILD = "PL_DOCKER_NO_BUILD";
export const PL_DOCKER_AUTOPUSH = "PL_DOCKER_AUTOPUSH";
export const PL_DOCKER_NO_AUTOPUSH = "PL_DOCKER_NO_AUTOPUSH";

export const CI = "CI";
export const RUNNER_DEBUG = "RUNNER_DEBUG";

export function isCI(): boolean {
  return process.env[CI] === "true";
}
export function isRunnerDebug(): boolean {
  return process.env[RUNNER_DEBUG] === "true" || process.env[RUNNER_DEBUG] === "1";
}
