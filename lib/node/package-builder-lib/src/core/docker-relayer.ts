// Re-layering of a built docker image by owning package, before the push.
//
// A Dockerfile decides the layers of an image: one per RUN/COPY step. One `pip install`,
// `conda install` or `apt-get install` step makes one layer, which can be many GB, is
// re-uploaded and re-pulled in full when any package in it changes, and can be too big for
// the registry to finalize before the pushing client gives up.
//
// With PL_DOCKER_RELAYER=chunkah the pushed image gets its layers from its content instead:
//   1. export the image filesystem into a docker volume (with xattrs and ACLs);
//   2. assets/relayer-tag.py tags each file with its owning package (pip, conda, dpkg, the
//      image's WORKDIR, else the directory), splits packages above a size cap, and sets
//      deterministic mtimes that keep timestamp-based .pyc files valid;
//   3. chunkah (https://github.com/coreos/chunkah) writes an OCI image with one layer per
//      package, or per few packages, at most DOCKER_RELAYER_MAX_LAYERS;
//   4. crane pushes that OCI layout.
// An unchanged package gives a byte-identical layer, so a one-package bump uploads (and a
// node pulls) about one package.
//
// What differs from the local image: the layers; file mtimes (see relayer-tag.py); a
// user.component xattr on each file; /.dockerenv and /dev/console from the export are dropped.
// chunkah keeps user, env, entrypoint, cmd, workdir, labels, volumes and exposed ports; it
// drops the docker-only healthcheck, shell, onbuild and the history.
//
// All tools run as containers on the same docker daemon, with data in docker volumes, so it
// works the same with a local daemon and with a remote one (dind in CI). The daemon needs
// free disk for one uncompressed and one compressed copy of the image while this runs.
// Needs bash on the host (not available on plain Windows).

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
// credential helpers, so the credentials are read on the host the way docker reads them, and
// given to crane as a generated config.json on stdin.

export type AuthEntry = { auth: string | undefined; identitytoken: string | undefined };

export type DockerConfig = {
  auths: Record<string, AuthEntry>; // keyed by normalized registry host
  credsStore: string | undefined;
  credHelpers: Record<string, string>; // keyed by normalized registry host
};

/** How docker would authenticate to a registry. */
export type AuthSource =
  | { kind: "entry"; entry: AuthEntry }
  | { kind: "helper"; helper: string }
  | { kind: "none" };

/** What crane gets: one `auths` entry of a docker config.json. */
export type CraneAuth = { auth?: string; identitytoken?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Registry host of a config key: "https://quay.io/v1/" -> "quay.io"; Docker Hub -> "docker.io". */
export function normalizeRegistryKey(key: string): string {
  const host = key
    .replace(/^[a-z]+:\/\//i, "")
    .split("/")[0]
    ?.toLowerCase();
  if (!host || host === "index.docker.io" || host === "registry-1.docker.io") return "docker.io";
  return host;
}

/** Parses ~/.docker/config.json; unknown or malformed fields are ignored. */
export function parseDockerConfig(text: string): DockerConfig {
  const raw: unknown = JSON.parse(text);
  const config: DockerConfig = { auths: {}, credsStore: undefined, credHelpers: {} };
  if (!isRecord(raw)) return config;
  if (isRecord(raw.auths)) {
    for (const [key, entry] of Object.entries(raw.auths)) {
      if (!isRecord(entry)) continue;
      config.auths[normalizeRegistryKey(key)] = {
        auth: typeof entry.auth === "string" && entry.auth !== "" ? entry.auth : undefined,
        identitytoken:
          typeof entry.identitytoken === "string" && entry.identitytoken !== ""
            ? entry.identitytoken
            : undefined,
      };
    }
  }
  if (typeof raw.credsStore === "string" && raw.credsStore !== "") {
    config.credsStore = raw.credsStore;
  }
  if (isRecord(raw.credHelpers)) {
    for (const [key, helper] of Object.entries(raw.credHelpers)) {
      if (typeof helper === "string" && helper !== "") {
        config.credHelpers[normalizeRegistryKey(key)] = helper;
      }
    }
  }
  return config;
}

/** Registry host of an image reference, as docker resolves it ("docker.io" for none). */
export function registryHost(tag: string): string {
  const first = tag.split("/")[0] ?? "";
  if (tag.includes("/") && (first.includes(".") || first.includes(":") || first === "localhost")) {
    return first.toLowerCase();
  }
  return "docker.io";
}

/**
 * Docker's order: a credHelpers entry for the host; else the credsStore, when set (docker then
 * ignores inline auths); else the inline auths entry.
 */
export function authSource(config: DockerConfig, host: string): AuthSource {
  const helper = config.credHelpers[host];
  if (helper) return { kind: "helper", helper };
  if (config.credsStore) return { kind: "helper", helper: config.credsStore };
  const entry = config.auths[host];
  if (entry && (entry.auth || entry.identitytoken)) return { kind: "entry", entry };
  return { kind: "none" };
}

/** A credential helper's answer as a config entry; "<token>" means an identity token. */
export function helperAnswerToAuth(stdout: string): CraneAuth | undefined {
  const parsed: unknown = JSON.parse(stdout);
  if (!isRecord(parsed) || typeof parsed.Secret !== "string" || parsed.Secret === "") {
    return undefined;
  }
  const username = typeof parsed.Username === "string" ? parsed.Username : "";
  if (username === "<token>") return { identitytoken: parsed.Secret };
  return { auth: Buffer.from(`${username}:${parsed.Secret}`).toString("base64") };
}

function dockerConfigPath(): string {
  const dir = process.env.DOCKER_CONFIG || path.join(os.homedir(), ".docker");
  return path.join(dir, "config.json");
}

/** Credentials docker would use for `host`; undefined means anonymous access. */
export function registryAuth(host: string, warn: (m: string) => void): CraneAuth | undefined {
  const file = dockerConfigPath();
  if (!fs.existsSync(file)) return undefined;
  const source = authSource(parseDockerConfig(fs.readFileSync(file, "utf-8")), host);
  if (source.kind === "none") return undefined;
  if (source.kind === "entry") {
    return { auth: source.entry.auth, identitytoken: source.entry.identitytoken };
  }

  const helper = `docker-credential-${source.helper}`;
  const serverUrl = host === "docker.io" ? "https://index.docker.io/v1/" : host;
  const result = spawnSync(helper, ["get"], { input: serverUrl, encoding: "utf-8" });
  if (result.error || result.status !== 0) {
    warn(
      `'${helper} get' found no credentials for '${host}' ` +
        `(${result.error ? String(result.error) : (result.stdout || result.stderr).trim()}); ` +
        `pushing without credentials. Log in with 'docker login ${host}' if the push is denied.`,
    );
    return undefined;
  }
  try {
    return helperAnswerToAuth(result.stdout);
  } catch {
    warn(`'${helper} get' returned an unreadable answer for '${host}'; pushing anonymously.`);
    return undefined;
  }
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

/** Compressed layer sizes and chunkah component names of the OCI image (manifest summary). */
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

/** Unix seconds of an image's Created time (docker inspect), 0 if unreadable. */
export function createdEpoch(created: string): number {
  const ms = Date.parse(created.trim());
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
}

const MANIFEST_SUMMARY = [
  "import json",
  "i = json.load(open('/out/image/index.json'))",
  "d = i['manifests'][0]['digest'].split(':')[1]",
  "m = json.load(open('/out/image/blobs/sha256/' + d))",
  "print(json.dumps([[l['size'], l.get('annotations', {}).get('org.chunkah.component', '')]",
  "                  for l in m['layers']]))",
].join("\n");

// Writes the config.json from stdin, then pushes. Values come in through the environment.
const CRANE_PUSH =
  "set -e; mkdir -p /tmp/cfg; cat > /tmp/cfg/config.json; " +
  'DOCKER_CONFIG=/tmp/cfg crane push /out/image "$PL_PUSH_TAG"';

/**
 * Re-layers local image `localTag` (see the file header) and pushes it as `pushTag`.
 * Layers above the size limit are reported like docker.checkLayerSizes does, but by
 * compressed size, which is what the registry receives.
 */
export function relayerAndPush(localTag: string, pushTag: string, logger: winston.Logger): void {
  const id = randomBytes(6).toString("hex");
  const label = "com.milaboratories.package-builder.relayer=" + id; // for sweeping leftovers
  const rootfs = `pl-relayer-rootfs-${id}`;
  const oci = `pl-relayer-oci-${id}`;
  const tools = defaults.DOCKER_RELAYER_TOOLS_IMAGE;
  let container = "";
  const started = Date.now();
  const step = (message: string) =>
    logger.info(`  [${Math.round((Date.now() - started) / 1000)}s] ${message}`);

  logger.info(`Re-layering docker image '${localTag}' by package (${envs.PL_DOCKER_RELAYER})...`);
  try {
    run("docker volume create", "docker", ["volume", "create", "--label", label, rootfs]);
    run("docker volume create", "docker", ["volume", "create", "--label", label, oci]);

    step("exporting the image filesystem");
    // a placeholder command: images without CMD/ENTRYPOINT (FROM scratch) cannot be created
    // otherwise. The container is never started.
    container = run("docker create", "docker", [
      "create",
      "--label",
      label,
      localTag,
      "/pl-relayer-placeholder",
    ]).trim();
    run("docker export", "bash", [
      "-o",
      "pipefail",
      "-c",
      'docker export "$1" | docker run --rm -i -v "$2":/r "$3" ' +
        "tar --numeric-owner --xattrs --xattrs-include='*' --acls -xpf - -C /r",
      "relayer-export",
      container,
      rootfs,
      tools,
    ]);
    run("docker rm", "docker", ["rm", "-v", container]);
    container = "";

    step("grouping files by package");
    const inspect = (format: string) =>
      run("docker inspect", "docker", ["image", "inspect", localTag, "--format", format]).trim();
    const workdir = inspect("{{.Config.WorkingDir}}");
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
    // The tagger already set every mtime; the image's build time as chunkah's clamp keeps
    // them (all are earlier) and gives the image a real creation time.
    const epoch = createdEpoch(inspect("{{.Created}}")) || Math.floor(Date.now() / 1000);
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
        "/dev/console",
        "--output",
        "oci:/out/image",
      ],
      {
        env: { CHUNKAH_CONFIG_STR: config, SOURCE_DATE_EPOCH: String(epoch) },
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
    const auth = registryAuth(host, (m) => logger.warn(m));
    // crane looks Docker Hub up under docker's legacy key
    const craneHost = host === "docker.io" ? "https://index.docker.io/v1/" : host;
    run(
      "crane push",
      "docker",
      [
        "run",
        "--rm",
        "-i",
        // the daemon's network: a registry on localhost, and the host's proxy routes
        "--network",
        "host",
        "-v",
        `${oci}:/out:ro`,
        "-e",
        "PL_PUSH_TAG",
        "-e",
        "HTTPS_PROXY",
        "-e",
        "NO_PROXY",
        "--entrypoint",
        "sh",
        defaults.DOCKER_RELAYER_CRANE_IMAGE,
        "-c",
        CRANE_PUSH,
      ],
      {
        // credentials go on stdin only: never in arguments or the container's env
        input: JSON.stringify({ auths: auth ? { [craneHost]: auth } : {} }),
        env: { PL_PUSH_TAG: pushTag },
        stdio: ["pipe", "inherit", "inherit"],
      },
    );
    step("done");
  } finally {
    if (container !== "") spawnSync("docker", ["rm", "-f", "-v", container], { stdio: "ignore" });
    spawnSync("docker", ["volume", "rm", "-f", rootfs, oci], { stdio: "ignore" });
  }
}
