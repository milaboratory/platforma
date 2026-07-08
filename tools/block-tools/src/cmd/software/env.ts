import { envs } from "@platforma-sdk/package-builder-lib";

// The `software build` knob env vars (the flag/env pairs the scenario scripts set).
export const PL_BUILD_CHANNEL = "PL_BUILD_CHANNEL";
export const PL_BUILD_VARIANT = "PL_BUILD_VARIANT";
export const PL_BUILD_LOCATION = "PL_BUILD_LOCATION";
export const PL_BUILD_USE_PUBLISHED = "PL_BUILD_USE_PUBLISHED";

// Every env var that changes `block-tools software build` output, so must key the turbo build cache.
export const softwareBuildCacheEnv: readonly string[] = [
  PL_BUILD_CHANNEL,
  PL_BUILD_VARIANT,
  PL_BUILD_LOCATION,
  PL_BUILD_USE_PUBLISHED,
  envs.PL_DOCKER_REGISTRY_PUSH_TO,
  envs.PL_DEV_DOCKER_PUSH_URL,
  envs.PL_DEV_DOCKER_PULL_URL,
  envs.PL_DEV_BINARY_UPLOAD_URL,
  envs.PL_RELEASE_DOCKER_PUSH_URL,
  envs.PL_RELEASE_DOCKER_PULL_URL,
  envs.PL_RELEASE_BINARY_UPLOAD_URL,
];
