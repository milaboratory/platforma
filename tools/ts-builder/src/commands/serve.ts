import { Command } from "commander";
import * as path from "node:path";
import {
  executeCommand,
  getConfigInfo,
  getGlobalOptions,
  getValidatedConfigPath,
  installSidecarCleanup,
  removeSidecar,
  requireTarget,
  resolveVite,
  validateTargetForBrowser,
  writeSidecar,
} from "./utils/index";

export const serveCommand = new Command("serve")
  .description("Start development server")
  .option("-p, --port <port>", "Port number")
  .option("--host <host>", "Host address")
  .option(
    "--sidecar-out <path>",
    "Directory the dev-server sidecar is written into (default: ./dist for block-ui)",
  )
  .action(async (options, command) => {
    const globalOpts = getGlobalOptions(command);
    const target = requireTarget(globalOpts);
    const customServeConfig = globalOpts.serveConfig;
    const useSources = globalOpts.useSources;

    validateTargetForBrowser(target);

    console.log(
      `Starting dev server for ${target} project${useSources ? " with sources condition" : ""}...`,
    );

    const configInfo = getConfigInfo(target);
    const configPath = getValidatedConfigPath(customServeConfig, configInfo!.filename);

    if (target === "block-ui") {
      await runBlockUiServe({
        configPath,
        port: options.port ? Number(options.port) : undefined,
        host: options.host,
        useSources,
        sidecarOut: options.sidecarOut,
      });
      return;
    }

    // Other targets keep the existing CLI-spawn behavior — no sidecar is written.
    try {
      const viteCommand = resolveVite();
      const viteArgs = ["dev", "--config", configPath];
      if (options.port) viteArgs.push("--port", options.port);
      if (options.host) viteArgs.push("--host", options.host);
      const env = useSources ? { USE_SOURCES: "1" } : undefined;
      await executeCommand(viteCommand, viteArgs, env);
    } catch (error) {
      console.error("Failed to start dev server:", error);
      process.exit(1);
    }
  });

interface BlockUiServeOptions {
  configPath: string;
  port?: number;
  host?: string;
  useSources?: boolean;
  sidecarOut?: string;
}

async function runBlockUiServe(opts: BlockUiServeOptions): Promise<void> {
  // Vite's config file reads USE_SOURCES from process.env, so set it before
  // we createServer.
  if (opts.useSources) {
    process.env.USE_SOURCES = "1";
  }

  // Vite is a peer dep of ts-builder; resolve it from the consumer package
  // so we use the same version the project's config is written against.
  let vite: typeof import("vite");
  try {
    vite = await import("vite");
  } catch (error) {
    console.error("Failed to load `vite`. Ensure it's installed as a dependency.", error);
    process.exit(1);
    return;
  }

  const server = await vite.createServer({
    configFile: opts.configPath,
    server: {
      port: opts.port,
      host: opts.host,
    },
  });

  await server.listen();
  server.printUrls();

  const url = server.resolvedUrls?.local?.[0];
  if (!url) {
    console.warn("vite did not report a local URL; skipping dev-server sidecar.");
    return;
  }

  const sidecarDir = opts.sidecarOut
    ? path.resolve(opts.sidecarOut)
    : path.resolve(process.cwd(), "dist");
  const sidecarPath = path.join(sidecarDir, ".dev-server");

  writeSidecar(sidecarPath, { schema: 1, url, pid: process.pid });
  installSidecarCleanup(sidecarPath);
  console.log(`Wrote dev-server sidecar: ${sidecarPath}`);

  // Make Vite's own close path remove the sidecar too — covers programmatic
  // shutdowns (e.g. test harnesses) where signal-based cleanup won't fire.
  const origClose = server.close.bind(server);
  server.close = async () => {
    removeSidecar(sidecarPath);
    return origClose();
  };
}
