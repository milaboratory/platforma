// Re-layering of a built docker image by owning package, before the push.
//
// A Dockerfile decides the layers of an image: one per RUN/COPY step. One `pip install`,
// `conda install` or `apt-get install` step makes one layer, which can be many GB, is
// re-uploaded and re-pulled in full when any package in it changes, and can be too big for
// the registry to finalize before the pushing client gives up.
//
// With PL_DOCKER_RELAYER=chunkah the pushed image gets its layers from its content instead:
//   1. export the image filesystem into a docker volume;
//   2. tag each file with its owning package (assets/relayer-tag.py: pip, conda, dpkg, the
//      image's WORKDIR, else the directory), splitting packages above a size cap;
//   3. chunkah (https://github.com/coreos/chunkah) writes an OCI image with one layer per
//      package, or per few packages, at most DOCKER_RELAYER_MAX_LAYERS;
//   4. crane pushes that OCI layout.
// An unchanged package gives a byte-identical layer, so a one-package bump uploads (and a
// node pulls) about one package. The image config (env, entrypoint, labels...) is kept.
//
// All tools run as containers on the same docker daemon, with data in docker volumes, so it
// works the same with a local daemon and with a remote one (dind in CI). The local image
// keeps its Dockerfile layers; only the pushed image is re-layered. Both have the same files.

import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type winston from "winston";

import * as defaults from "../defaults";
import * as docker from "./docker";
import * as envs from "./envs";
import * as paths from "./paths";
import * as util from "./util";

/** True when PL_DOCKER_RELAYER selects a re-layering tool. */
export function isEnabled(): boolean {
  const value = process.env[envs.PL_DOCKER_RELAYER]?.trim() ?? "";
  if (value === "" || value === "off") return false;
  if (value === "chunkah") return true;
  throw util.CLIError(`${envs.PL_DOCKER_RELAYER} must be 'chunkah' or 'off', got '${value}'`);
}

// ---------------------------------------------------------------------------------------
// Registry credentials. crane runs in a container and cannot use the host's docker
// credential helpers, so the credentials are read on the host and given to it on stdin.

export type DockerConfig = {
  auths: Record<string, string | undefined>; // registry -> base64 "user:password"
  credsStore: string | undefined;
  credHelpers: Record<string, string>;
};

export type AuthSource =
  | { kind: "basic"; username: string; password: string }
  | { kind: "helper"; helper: string };

export type Credentials = { username: string; password: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parses ~/.docker/config.json; unknown or malformed fields are ignored. */
export function parseDockerConfig(text: string): DockerConfig {
  const raw: unknown = JSON.parse(text);
  const config: DockerConfig = { auths: {}, credsStore: undefined, credHelpers: {} };
  if (!isRecord(raw)) return config;
  if (isRecord(raw.auths)) {
    for (const [registry, entry] of Object.entries(raw.auths)) {
      config.auths[registry] =
        isRecord(entry) && typeof entry.auth === "string" ? entry.auth : undefined;
    }
  }
  if (typeof raw.credsStore === "string" && raw.credsStore !== "") {
    config.credsStore = raw.credsStore;
  }
  if (isRecord(raw.credHelpers)) {
    for (const [registry, helper] of Object.entries(raw.credHelpers)) {
      if (typeof helper === "string") config.credHelpers[registry] = helper;
    }
  }
  return config;
}

/** Registry host of an image reference, as docker resolves it ("docker.io" for none). */
export function registryHost(tag: string): string {
  const first = tag.split("/")[0] ?? "";
  if (tag.includes("/") && (first.includes(".") || first.includes(":") || first === "localhost")) {
    return first;
  }
  return "docker.io";
}

/** Where docker would take the credentials for `host` from, in docker's own order. */
export function authSource(config: DockerConfig, host: string): AuthSource | undefined {
  const keys = host === "docker.io" ? ["https://index.docker.io/v1/", "docker.io"] : [host];
  for (const key of keys) {
    const helper = config.credHelpers[key];
    if (helper) return { kind: "helper", helper };
  }
  for (const key of keys) {
    const auth = config.auths[key];
    if (auth) {
      const decoded = Buffer.from(auth, "base64").toString("utf-8");
      const colon = decoded.indexOf(":");
      if (colon > 0) {
        return {
          kind: "basic",
          username: decoded.slice(0, colon),
          password: decoded.slice(colon + 1),
        };
      }
    }
  }
  if (config.credsStore) return { kind: "helper", helper: config.credsStore };
  return undefined;
}

function dockerConfigPath(): string {
  const dir = process.env.DOCKER_CONFIG || path.join(os.homedir(), ".docker");
  return path.join(dir, "config.json");
}

/** Credentials docker would use to push to `host`, or undefined for anonymous access. */
export function registryCredentials(host: string): Credentials | undefined {
  const file = dockerConfigPath();
  if (!fs.existsSync(file)) return undefined;
  const source = authSource(parseDockerConfig(fs.readFileSync(file, "utf-8")), host);
  if (!source) return undefined;
  if (source.kind === "basic") return { username: source.username, password: source.password };

  const result = spawnSync(`docker-credential-${source.helper}`, ["get"], {
    input: host === "docker.io" ? "https://index.docker.io/v1/" : host,
    encoding: "utf-8",
  });
  if (result.error || result.status !== 0) {
    // the helper has no entry: docker would push anonymously too
    return undefined;
  }
  const parsed: unknown = JSON.parse(result.stdout);
  if (
    isRecord(parsed) &&
    typeof parsed.Username === "string" &&
    typeof parsed.Secret === "string"
  ) {
    return { username: parsed.Username, password: parsed.Secret };
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------
// Steps

function run(
  description: string,
  command: string,
  args: string[],
  options: SpawnSyncOptions = {},
): string {
  const result = spawnSync(command, args, {
    stdio: ["pipe", "pipe", "inherit"],
    encoding: "utf-8",
    ...options,
    env: {
      ...process.env, // PATH variable from parent process affects execution
      HOME: process.env.HOME || os.homedir(), // Ensure HOME is set
      ...options.env,
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw util.CLIError(`image re-layering: ${description} failed with status ${result.status}`);
  }
  return typeof result.stdout === "string" ? result.stdout : "";
}

/** Compressed layer sizes and chunkah component names of the OCI image in `volume`. */
export function parseLayers(json: string): docker.ImageLayer[] {
  const raw: unknown = JSON.parse(json);
  if (!Array.isArray(raw)) throw util.CLIError(`image re-layering: unexpected manifest summary`);
  return raw.map((entry: unknown): docker.ImageLayer => {
    if (!Array.isArray(entry)) return { bytes: undefined, createdBy: "" };
    const [size, component] = entry;
    return {
      bytes: typeof size === "number" ? size : undefined,
      createdBy: typeof component === "string" && component !== "" ? `component ${component}` : "",
    };
  });
}

const MANIFEST_SUMMARY = [
  "import json",
  "i = json.load(open('/out/image/index.json'))",
  "d = i['manifests'][0]['digest'].split(':')[1]",
  "m = json.load(open('/out/image/blobs/sha256/' + d))",
  "print(json.dumps([[l['size'], l.get('annotations', {}).get('org.chunkah.component', '')]",
  "                  for l in m['layers']]))",
].join("\n");

/**
 * Re-layers local image `localTag` (see the file header) and pushes it as `pushTag`.
 * Layers above the size limit are reported like docker.checkLayerSizes does, but by
 * compressed size, which is what the registry receives.
 */
export function relayerAndPush(localTag: string, pushTag: string, logger: winston.Logger): void {
  const id = randomBytes(6).toString("hex");
  const rootfs = `pl-relayer-rootfs-${id}`;
  const oci = `pl-relayer-oci-${id}`;
  const tools = defaults.DOCKER_RELAYER_TOOLS_IMAGE;
  let container = "";
  const started = Date.now();
  const step = (message: string) =>
    logger.info(`  [${Math.round((Date.now() - started) / 1000)}s] ${message}`);

  logger.info(`Re-layering docker image '${localTag}' by package (${envs.PL_DOCKER_RELAYER})...`);
  try {
    run("docker volume create", "docker", ["volume", "create", rootfs]);
    run("docker volume create", "docker", ["volume", "create", oci]);

    step("exporting the image filesystem");
    container = run("docker create", "docker", ["create", localTag]).trim();
    run("docker export", "bash", [
      "-o",
      "pipefail",
      "-c",
      'docker export "$1" | docker run --rm -i -v "$2":/r "$3" tar --numeric-owner -xpf - -C /r',
      "relayer-export",
      container,
      rootfs,
      tools,
    ]);
    run("docker rm", "docker", ["rm", container]);
    container = "";

    step("grouping files by package");
    const workdir = run("docker inspect", "docker", [
      "image",
      "inspect",
      localTag,
      "--format",
      "{{.Config.WorkingDir}}",
    ]).trim();
    run(
      "tagging files",
      "docker",
      [
        "run",
        "--rm",
        "-i",
        "-v",
        `${rootfs}:/r`,
        tools,
        "python3",
        "-I",
        "-",
        "/r",
        workdir,
        String(defaults.DOCKER_RELAYER_COMPONENT_MAX_BYTES),
      ],
      { input: fs.readFileSync(paths.assets("relayer-tag.py"), "utf-8") },
    );

    step("writing package layers (chunkah)");
    const config = run("docker inspect", "docker", ["image", "inspect", localTag]);
    run(
      "chunkah",
      "docker",
      [
        "run",
        "--rm",
        "-v",
        `${rootfs}:/chunkah:ro`,
        "-v",
        `${oci}:/out`,
        "-e",
        "CHUNKAH_CONFIG_STR",
        "-e",
        "SOURCE_DATE_EPOCH",
        defaults.DOCKER_RELAYER_CHUNKAH_IMAGE,
        "build",
        "--compressed",
        "--max-layers",
        String(defaults.DOCKER_RELAYER_MAX_LAYERS),
        "--prune",
        "/.dockerenv",
        "--prune",
        "/root/.cache/",
        "--output",
        "oci:/out/image",
      ],
      {
        env: {
          CHUNKAH_CONFIG_STR: config,
          SOURCE_DATE_EPOCH: process.env.SOURCE_DATE_EPOCH ?? "0",
        },
        stdio: ["pipe", "inherit", "inherit"],
      },
    );
    run("docker volume rm", "docker", ["volume", "rm", rootfs]);

    const layers = parseLayers(
      run("reading the manifest", "docker", [
        "run",
        "--rm",
        "-v",
        `${oci}:/out:ro`,
        tools,
        "python3",
        "-I",
        "-c",
        MANIFEST_SUMMARY,
      ]),
    );
    const total = layers.reduce((sum, l) => sum + (l.bytes ?? 0), 0);
    step(`${layers.length} layers, ${(total / 1024 ** 3).toFixed(2)} GiB compressed`);
    docker.reportOversizedLayers(pushTag, layers, "compressed", (m) => logger.warn(m));

    step(`pushing '${pushTag}' (crane)`);
    const host = registryHost(pushTag);
    const creds = registryCredentials(host);
    run(
      "crane push",
      "docker",
      [
        "run",
        "--rm",
        "-i",
        "-v",
        `${oci}:/out:ro`,
        "-e",
        "PL_REG_HOST",
        "-e",
        "PL_REG_USER",
        "-e",
        "PL_PUSH_TAG",
        "--entrypoint",
        "sh",
        defaults.DOCKER_RELAYER_CRANE_IMAGE,
        "-c",
        'set -e; if [ -n "$PL_REG_USER" ]; then crane auth login "$PL_REG_HOST" ' +
          '-u "$PL_REG_USER" --password-stdin; fi; crane push /out/image "$PL_PUSH_TAG"',
      ],
      {
        // the password goes on stdin only: never in arguments or the container's env
        input: creds?.password ?? "",
        env: {
          PL_REG_HOST: host === "docker.io" ? "index.docker.io" : host,
          PL_REG_USER: creds?.username ?? "",
          PL_PUSH_TAG: pushTag,
        },
        stdio: ["pipe", "inherit", "inherit"],
      },
    );
    step("done");
  } finally {
    if (container !== "") spawnSync("docker", ["rm", "-f", container], { stdio: "ignore" });
    spawnSync("docker", ["volume", "rm", "-f", rootfs, oci], { stdio: "ignore" });
  }
}
