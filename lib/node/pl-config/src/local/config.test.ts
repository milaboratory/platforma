import { onTestFinished, test, vi } from "vitest";
import { ConsoleLoggerAdapter } from "@milaboratories/ts-helpers";
import fs from "fs/promises";
import upath from "upath";
import type { LocalPlConfigGeneratorOptions } from "./config";
import { generateLocalPlConfigs } from "./config";

test("should return right configs", async ({ expect }) => {
  const logger = new ConsoleLoggerAdapter();
  const workingDir = upath.resolve(upath.join(__dirname, "..", "..", ".test"));
  await fs.rm(workingDir, { recursive: true, force: true });

  const opts: LocalPlConfigGeneratorOptions = {
    logger,
    workingDir,
    licenseMode: { type: "plain", value: "abc" },
    portsMode: {
      type: "custom",
      ports: {
        grpc: 11234,
        http: 11237,
        monitoring: 11235,
        debug: 11236,
      },
    },
    numCpu: 5,
    useGlobalAccess: true,
    extraArgs: ["--log-level=debug"],
  };

  const got = await generateLocalPlConfigs(opts);

  expect(got.plAddress).toStrictEqual("127.0.0.1:11234");
  expect(got.localStorageProjections).toStrictEqual([
    { storageId: "root", localPath: "" },
    { storageId: "main", localPath: upath.join(workingDir, "storages", "main") },
  ]);

  const wd = (p: string) => upath.join(workingDir, p);
  expect(got.plArgs).toStrictEqual([
    "--listen-address=127.0.0.1",
    "--listen-port=11234",
    "--listen-http-port=11237",
    "--monitoring-ip=127.0.0.1",
    "--monitoring-port=11235",
    "--debug-enabled",
    "--debug-ip=127.0.0.1",
    "--debug-port=11236",
    `--main-root=${workingDir}`,
    `--db-dir=${wd("db")}`,
    `--work-dir=${wd("storages/work")}`,
    `--packages-dir=${wd("packages")}`,
    `--primary-storage-fs=${wd("storages/main")}`,
    "--primary-storage-fs-url=http://127.0.0.1:11237",
    "--primary-storage-id=main",
    "--work-storage-id=work",
    "--host-data-library-id=root",
    "--host-data-library-downloadable",
    "--primary-storage-fs-local-access",
    `--auth-htpasswd=${wd("users.htpasswd")}`,
    `--master-secret-file=${wd("gen/master-secret")}`,
    `--license-file=${wd("gen/license")}`,
    "--runner-local-cpu=5",
    "--keep-faulty-workdirs=1h",
    `--log-dst=file://${wd("platforma.log")}`,
    "--package-registry=platforma-open=https://bin-ga.pl-open.science",
    "--log-level=debug",
  ]);

  expect(await fs.readFile(wd("gen/license"), "utf8")).toStrictEqual("abc");
  expect(await fs.readFile(wd("users.htpasswd"), "utf8")).toStrictEqual(
    `default-user:${got.plPassword}`,
  );

  // base64url of 32 random bytes: what the backend accepts as a master secret
  const masterSecret = await fs.readFile(wd("gen/master-secret"), "utf8");
  expect(Buffer.from(masterSecret, "base64url")).toHaveLength(32);

  // secrets persist between generations, the license follows the latest value
  const again = await generateLocalPlConfigs({
    ...opts,
    licenseMode: { type: "plain", value: "xyz" },
  });
  expect(again.plPassword).toStrictEqual(got.plPassword);
  expect(await fs.readFile(wd("gen/master-secret"), "utf8")).toStrictEqual(masterSecret);
  expect(await fs.readFile(wd("gen/license"), "utf8")).toStrictEqual("xyz");
});

test("should pass a license file as is", async ({ expect }) => {
  const workingDir = upath.resolve(upath.join(__dirname, "..", "..", ".test-license-file"));
  await fs.rm(workingDir, { recursive: true, force: true });

  vi.stubEnv("MI_LICENSE", "");
  vi.stubEnv("PL_LICENSE", "");
  vi.stubEnv("MI_LICENSE_FILE", "/somewhere/mi.license");
  onTestFinished(() => {
    vi.unstubAllEnvs();
  });

  const got = await generateLocalPlConfigs({
    logger: new ConsoleLoggerAdapter(),
    workingDir,
    licenseMode: { type: "env" },
    portsMode: { type: "pickFree" },
  });

  expect(got.plArgs).toContain("--license-file=/somewhere/mi.license");
  expect(got.plArgs.some((a) => a.startsWith("--package-registry="))).toBe(false);
});
