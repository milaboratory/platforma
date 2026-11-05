import { spawnSync } from "node:child_process";
import * as defaults from "../defaults";
import type * as artifacts from "./schemas/artifacts";
import * as util from "./util";
import * as envs from "./envs";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

/**
 * To allow entrypoint keep both docker and binary package at the same time, we create virtual entrypoint with ':docker' suffix,
 * as entrypoints could not keep two different artifacts at the same time.
 */
export function entrypointName(name: string): string {
  return name + ":docker";
}

export function isVirtualDockerEntrypointName(name: string): boolean {
  return name.endsWith(":docker");
}

export function entrypointNameToOrigin(name: string): string {
  if (!isVirtualDockerEntrypointName(name)) {
    return name;
  }
  return name.substring(0, name.length - ":docker".length);
}

export function getImageHash(tag: string): string {
  const result = spawnSync(
    "docker",
    ["image", "ls", "--filter=reference=" + tag, "--format={{.ID}}"],
    {
      stdio: "pipe",
      env: {
        ...process.env, // PATH variable from parent process affects execution
        HOME: process.env.HOME || os.homedir(), // Ensure HOME is set
      },
    },
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw util.CLIError(`local docker image check failed with status ${result.status}`);
  }

  const output = result.stdout.toString().trim();
  if (output.split("\n").length > 1) {
    throw util.CLIError(
      `package-builder internal logic error: more than one image found by exact tag match: ${output}`,
    );
  }

  return output;
}

export function getImageEntrypoint(tag: string): string[] {
  const result = spawnSync(
    "docker",
    ["image", "inspect", tag, "--format", "{{ .Config.Entrypoint | json }}"],
    {
      stdio: "pipe",
      env: {
        ...process.env, // PATH variable from parent process affects execution
        HOME: process.env.HOME || os.homedir(), // Ensure HOME is set
      },
    },
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw util.CLIError(`'docker image inspect' failed with status ${result.status}`);
  }

  const output = result.stdout.toString().trim(); // 'null' or '[<string>, ...]' in JSON format
  return (JSON.parse(output) ?? []) as string[];
}

export function localImageExists(tag: string): boolean {
  return getImageHash(tag) !== "";
}

export function remoteImageExists(tag: string): boolean {
  const result = spawnSync("docker", ["manifest", "inspect", tag], {
    stdio: "pipe",
    env: {
      ...process.env, // PATH variable from parent process affects execution
      HOME: process.env.HOME || os.homedir(), // Ensure HOME is set
    },
  });

  if (result.error || result.status !== 0) {
    return false;
  }

  return true;
}

export function build(
  context: string,
  dockerfile: string,
  tag: string,
  softwarePackage: string,
  softwareVersion: string | undefined,
) {
  const result = spawnSync(
    "docker",
    [
      "build",
      // Pin platform so Platforma's linux/amd64 K8s nodes can run the image
      // regardless of host arch (cross-compile via qemu on non-x64 hosts).
      "--platform",
      defaults.DOCKER_BUILD_PLATFORM,
      "-t",
      tag,
      context,
      "-f",
      dockerfile,
      "--label",
      "com.milaboratories.package-builder.software=true",
      "--label",
      "com.milaboratories.package-builder.software.package=" + softwarePackage,
      "--label",
      "com.milaboratories.package-builder.software.version=" + softwareVersion,
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env, // PATH variable from parent process affects execution
        HOME: process.env.HOME || os.homedir(), // Ensure HOME is set
        // Disables buildx default provenance so the image ID stays stable; podman ignores it.
        BUILDX_NO_DEFAULT_ATTESTATIONS: "1",
      },
    },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw util.CLIError(`'docker build' failed with status ${result.status}`);
  }
}

export function push(tag: string) {
  const result = spawnSync("docker", ["push", tag], {
    stdio: "inherit",
    env: {
      ...process.env, // PATH variable from parent process affects execution
      HOME: process.env.HOME || os.homedir(), // Ensure HOME is set
    },
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const registry = tag.split("/")[0];
    throw util.CLIError(
      `'docker push ${tag}' failed with status ${result.status}.\n` +
        `If the error above mentions authentication or denied access, log in first:\n` +
        `  aws sso login --profile research-poweruser <YOUR_PROFILE:research-poweruser?> \n` +
        `Then login in docker:` +
        `  aws ecr-public get-login-password --region us-east-1 | docker login --username AWS --password-stdin ${registry}\n` +
        `(for a private ECR use 'aws ecr' and your region instead of 'ecr-public'/us-east-1).`,
    );
  }
}

export type ImageLayer = {
  /** Uncompressed layer size in bytes, as `docker history` reports it. */
  bytes: number;
  /** The Dockerfile instruction that created the layer. */
  createdBy: string;
};

/** Layers of a local image, newest first (the order of `docker history`). */
export function getImageLayers(tag: string): ImageLayer[] {
  const result = spawnSync(
    "docker",
    ["history", "--no-trunc", "--human=false", "--format", "{{.Size}}\t{{.CreatedBy}}", tag],
    {
      encoding: "utf-8",
      env: {
        ...process.env, // PATH variable from parent process affects execution
        HOME: process.env.HOME || os.homedir(), // Ensure HOME is set
      },
    },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw util.CLIError(`'docker history ${tag}' failed with status ${result.status}`);
  }
  return parseImageHistory(result.stdout ?? "");
}

export function parseImageHistory(output: string): ImageLayer[] {
  return output
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const tab = line.indexOf("\t");
      const size = tab === -1 ? line : line.slice(0, tab);
      const bytes = Number.parseInt(size.trim(), 10);
      return {
        bytes: Number.isFinite(bytes) ? bytes : 0,
        createdBy: tab === -1 ? "" : line.slice(tab + 1).trim(),
      };
    });
}

/**
 * Layers bigger than `limit` bytes. Registries finalize an uploaded layer in one request, and
 * a client gives up waiting for that request after a fixed time (30 s in containerd >= 2.3), so
 * multi-GB layers can fail to push even though the upload itself completed.
 */
export function oversizedLayers(layers: ImageLayer[], limit: number): ImageLayer[] {
  return layers.filter((layer) => layer.bytes > limit);
}

/**
 * Report image layers bigger than the limit: PL_DOCKER_MAX_LAYER_BYTES when set (then an
 * oversized layer fails the build), defaults.DOCKER_MAX_LAYER_BYTES otherwise (then it warns).
 * Runs after the build and before the push, so the failure names the layer instead of
 * surfacing as a registry timeout.
 */
export function checkLayerSizes(tag: string, warn: (message: string) => void): void {
  const raw = process.env[envs.PL_DOCKER_MAX_LAYER_BYTES]?.trim();
  const enforced = raw !== undefined && raw !== "";
  const limit = enforced ? Number(raw) : defaults.DOCKER_MAX_LAYER_BYTES;
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw util.CLIError(
      `${envs.PL_DOCKER_MAX_LAYER_BYTES} must be a positive number of bytes, got '${raw}'`,
    );
  }

  let layers: ImageLayer[];
  try {
    layers = getImageLayers(tag);
  } catch (e) {
    // The check is advisory unless enforced; never let it break a build that succeeded.
    if (enforced) throw e;
    warn(`Could not check layer sizes of '${tag}': ${String(e)}`);
    return;
  }

  const oversized = oversizedLayers(layers, limit);
  if (oversized.length === 0) {
    return;
  }

  const gib = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
  const message =
    `Image '${tag}' has ${oversized.length} layer(s) above ${gib(limit)} (uncompressed):\n` +
    oversized.map((l) => `  ${gib(l.bytes)}  ${l.createdBy.slice(0, 160)}`).join("\n") +
    `\nRegistries may not finalize a layer this big before the pushing client gives up ` +
    `('timeout awaiting response headers'). Split the step that creates it into several ` +
    `RUN/COPY steps, or shrink what it installs. Autogenerated python images already split ` +
    `their dependencies; an oversized layer there means a single file above the limit.`;
  if (enforced) {
    throw util.CLIError(message);
  }
  warn(message);
}

export function addTag(imageIdOrTag: string, newTag: string) {
  const result = spawnSync("docker", ["image", "tag", imageIdOrTag, newTag], {
    stdio: "inherit",
    env: {
      ...process.env, // PATH variable from parent process affects execution
      HOME: process.env.HOME || os.homedir(), // Ensure HOME is set
    },
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw util.CLIError(`'docker tag' failed with status ${result.status}`);
  }
}

export function removeTag(imageTag: string) {
  const result = spawnSync("docker", ["image", "rm", imageTag], {
    stdio: "inherit",
    env: {
      ...process.env, // PATH variable from parent process affects execution
      HOME: process.env.HOME || os.homedir(), // Ensure HOME is set
    },
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw util.CLIError(`'docker image rm' failed with status ${result.status}`);
  }
}

/**
 * Generate unique content-addressable image tag
 * @param artifactName: artifact name generated from package name and artifact ID (or explicitly set for artifact in .name field)
 * @param imageID: unique image content hash (docker image ID in docker ls)
 * @param registry: custom registry and repository to use for this image
 * @returns full image tag in format: <registry>/repository:<artifactName>.<imageID>
 */
export function generateRemoteTagName(
  artifactName: string,
  imageID: string,
  registry?: string,
): string {
  return dockerTag(artifactName, imageID, registry);
}

/**
 * Generate unique content-addressable image tag out of directories and Dockerfile.
 * @param packageRoot: package root path from where to resolve artifact's paths (context, Dockerfile, ...)
 * @param artifact: docker artifact configuration
 * @returns full image tag in format: <registry>/repository:<artifactName>.<contentHash>
 */
export function generateLocalTagName(packageRoot: string, artifact: artifacts.dockerType): string {
  const dockerfile = dockerfileAbsPath(packageRoot, artifact);
  const context = contextAbsPath(packageRoot, artifact);
  const hash = contentHash(context, dockerfile);

  return dockerTag("local-image", hash);
}

/**
 * Absolute path to autogenerated Dockerfile for given artifact.
 * @param packageRoot: package root path from where to resolve artifact's paths (context, Dockerfile, ...)
 * @param artifactID: artifact ID
 * @returns absolute path to autogenerated Dockerfile
 */
export function dockerfileAutogenPath(packageRoot: string, artifactID: string): string {
  return path.resolve(packageRoot, "dist", "docker", `Dockerfile-${artifactID}`);
}

/**
 * Resolve path to Dockerfile.
 * @param packageRoot: package root path from where to resolve artifact's paths (context, Dockerfile, ...)
 * @param artifact: docker artifact configuration
 * @returns absolute path to Dockerfile
 */
function dockerfileAbsPath(packageRoot: string, artifact: artifacts.dockerType): string {
  return path.resolve(packageRoot, artifact.dockerfile ?? "Dockerfile");
}

/**
 * Resolve path to docker build context directory.
 * @param packageRoot: package root path from where to resolve artifact's paths (context, Dockerfile, ...)
 * @param artifact: docker artifact configuration
 * @returns absolute path to docker build context directory
 */
function contextAbsPath(packageRoot: string, artifact: artifacts.dockerType): string {
  if (artifact.context === "./" || artifact.context === ".") {
    throw util.CLIError(
      `Invalid Docker context: "${artifact.context}". Context cannot be "./" or "." - use absolute path or relative path without "./" prefix`,
    );
  }
  return path.resolve(packageRoot, artifact.context ?? ".");
}

/**
 * Calculate cummulative hash of docker build context directory context and Dockerfile.
 * To speedup hash calculation, we do not read contents of each item in context dir but
 * use metadata (size, mtime, ...).
 *
 * @param contextFullPath: abs path to docker build context
 * @param dockerfileFullPath: abs path to Dockerfile
 * @returns hash of what the keep
 */
function contentHash(contextFullPath: string, dockerfileFullPath: string): string {
  if (!fs.existsSync(dockerfileFullPath)) {
    throw util.CLIError(`Dockerfile '${dockerfileFullPath}' not found`);
  }

  if (!fs.existsSync(contextFullPath)) {
    throw util.CLIError(`Context '${contextFullPath}' not found`);
  }

  const contextHash = util.hashDirMetaSync(contextFullPath);
  const dockerfileContent = fs.readFileSync(dockerfileFullPath, "utf8");
  contextHash.update(dockerfileContent);

  return contextHash.digest("hex").slice(0, 12);
}

function dockerTag(packageName: string, contentHash: string, registry?: string): string {
  const dockerRegistry = registry ?? defaults.DOCKER_REGISTRY;
  return `${dockerRegistry}:${packageName.replaceAll("/", ".")}.${contentHash}`;
}
