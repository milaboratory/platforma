import { ConsoleLoggerAdapter, HmacSha256Signer } from "@milaboratories/ts-helpers";
import { LsDriver, type LsEntryWithFileStats } from "./ls";
import { TestHelpers } from "@milaboratories/pl-client";
import * as path from "node:path";
import { test, expect, describe } from "vitest";
import { isImportFileHandleIndex, isImportFileHandleUpload } from "@milaboratories/pl-model-common";
import type { StorageHandle } from "@milaboratories/pl-model-common";
import * as env from "../test_env";
import { parseIndexHandle } from "./helpers/ls_remote_import_handle";
import { createRemoteStorageHandle } from "./helpers/ls_storage_entry";

const assetsPath = path.resolve("../../../assets");

test("should ok when get all storages from ls driver", async () => {
  const signer = new HmacSha256Signer("abc");
  const logger = new ConsoleLoggerAdapter();
  await TestHelpers.withTempRoot(async (client) => {
    const driver = await LsDriver.init(logger, client, signer, [], () => {
      throw Error();
    });

    const got = await driver.getStorageList();

    expect(got.length).toBeGreaterThanOrEqual(1);
    expect(got.find((se) => se.id == env.libraryStorage)?.handle).toContain(env.libraryStorage);
    expect(got.find((se) => se.id == env.libraryStorage)?.initialFullPath).toEqual("");
    // expect(got.find((se) => se.name == 'local')?.handle).toContain('/');
    // expect(got.find((se) => se.name == 'local')?.initialFullPath).toEqual(os.homedir());

    console.log("got all storage entries: ", got);
  });
});

test("should ok when list files from remote storage in ls driver", async () => {
  const signer = new HmacSha256Signer("abc");
  const logger = new ConsoleLoggerAdapter();
  await TestHelpers.withTempRoot(async (client) => {
    const driver = await LsDriver.init(logger, client, signer, [], () => {
      throw Error();
    });

    const storages = await driver.getStorageList();
    const library = storages.find((se) => se.id == env.libraryStorage)!.handle;

    const topLevelDir = await driver.listFiles(library, "");
    expect(topLevelDir.entries.length).toBeGreaterThan(1);

    const testDir = topLevelDir.entries.find((d) => d.name.includes("ls_dir_structure"));
    expect(testDir).toBeDefined();
    expect(testDir!.type).toEqual("dir");

    expect(universalPath(testDir!.fullPath)).toEqual("ls_dir_structure_test");
    expect(testDir!.name).toEqual("ls_dir_structure_test");

    const secondDirs = await driver.listFiles(library, testDir!.fullPath);
    expect(
      secondDirs.entries,
      `unexpected entries for ${testDir!.fullPath}: ${JSON.stringify(secondDirs.entries, null, 2)}`,
    ).toHaveLength(2);
    expect(secondDirs.entries[0].type).toEqual("dir");
    expect(universalPath(secondDirs.entries[0].fullPath)).toEqual("ls_dir_structure_test/abc");
    expect(secondDirs.entries[0].name).toEqual("abc");

    const f = await driver.listFiles(library, secondDirs.entries[0].fullPath);
    expect(
      f.entries,
      `unexpected entries for ${secondDirs.entries[0].fullPath}: ${JSON.stringify(f.entries, null, 2)}`,
    ).toHaveLength(1);
    expect(f.entries[0].type).toEqual("file");
    expect(universalPath(f.entries[0].fullPath)).toEqual("ls_dir_structure_test/abc/42.txt");
    expect(f.entries[0].name).toEqual("42.txt");
    expect((f.entries[0] as any).handle).toContain("index://index/");
  });
});

// ls_dir_structure_test is {abc/42.txt, abc2/.gitkeep} — a folder per "sample",
// which is the layout `depth` exists for: the files a user wants to pick
// together sit in sibling folders, one level down.
const nestedFixture = "ls_dir_structure_test";

const universalPath = (p: string) => (p.startsWith("/") ? p.slice(1) : p);

const sortedPaths = (entries: { type: string; fullPath: string }[], type: "dir" | "file") =>
  entries
    .filter((e) => e.type === type)
    .map((e) => universalPath(e.fullPath))
    .sort();

test("should list nested files in one call when depth is given", async () => {
  const signer = new HmacSha256Signer("abc");
  const logger = new ConsoleLoggerAdapter();
  await TestHelpers.withTempRoot(async (client) => {
    const driver = await LsDriver.init(logger, client, signer, [], () => {
      throw Error();
    });

    const storages = await driver.getStorageList();
    const library = storages.find((se) => se.id == env.libraryStorage)!.handle;

    const root = (await driver.listFiles(library, "")).entries.find((d) =>
      d.name.includes(nestedFixture),
    )!.fullPath;

    const deep = await driver.listFiles(library, root, { depth: 2 });
    expect(sortedPaths(deep.entries, "file")).toEqual([
      `${nestedFixture}/abc/42.txt`,
      `${nestedFixture}/abc2/.gitkeep`,
    ]);
    // Directories of the browsed level stay listed, so navigation keeps working.
    expect(sortedPaths(deep.entries, "dir")).toEqual([
      `${nestedFixture}/abc`,
      `${nestedFixture}/abc2`,
    ]);
    expect(deep.truncated).toBeUndefined();

    // depth 1 — and no ops at all — is the historical single-level listing.
    for (const shallow of [
      await driver.listFiles(library, root, { depth: 1 }),
      await driver.listFiles(library, root),
    ]) {
      expect(sortedPaths(shallow.entries, "file")).toEqual([]);
      expect(sortedPaths(shallow.entries, "dir")).toEqual([
        `${nestedFixture}/abc`,
        `${nestedFixture}/abc2`,
      ]);
      expect(shallow.truncated).toBeUndefined();
    }

    // The entry cap is reported, never silently applied.
    const capped = await driver.listFiles(library, root, { depth: 2, limit: 3 });
    expect(capped.entries).toHaveLength(3);
    expect(capped.truncated).toBe(true);
  });
});

test("should list nested files from local storage when depth is given", async () => {
  const signer = new HmacSha256Signer("abc");
  const logger = new ConsoleLoggerAdapter();
  await TestHelpers.withTempRoot(async (client) => {
    const driver = await LsDriver.init(logger, client, signer, [], () => {
      throw Error();
    });

    const storages = await driver.getStorageList();
    const local = storages.find((se) => se.id == "local")!;
    const root = path.join(assetsPath, nestedFixture);

    const deep = await driver.listFiles(local.handle, root, { depth: 2 });
    const files = deep.entries
      .filter((e) => e.type === "file")
      .map((e) => path.relative(root, e.fullPath).split(path.sep).join("/"))
      .sort();
    expect(files).toEqual(["abc/42.txt", "abc2/.gitkeep"]);
    expect(deep.entries.filter((e) => e.type === "dir")).toHaveLength(2);
    expect(deep.unreadableDirs).toBeUndefined();

    const shallow = await driver.listFiles(local.handle, root);
    expect(shallow.entries.filter((e) => e.type === "file")).toHaveLength(0);
  });
});

test("should ok when list files from local storage in ls driver", async () => {
  const signer = new HmacSha256Signer("abc");
  const logger = new ConsoleLoggerAdapter();
  await TestHelpers.withTempRoot(async (client) => {
    const driver = await LsDriver.init(logger, client, signer, [], () => {
      throw Error();
    });

    const storages = await driver.getStorageList();
    const local = storages.find((se) => se.id == "local")!;

    const defaultDir = await driver.listFiles(local.handle, local.initialFullPath);
    expect(defaultDir.entries.length).toBeGreaterThan(1);
  });
});

test("should ok when list files from local storage in ls driver and correctly apply local projections", async () => {
  const signer = new HmacSha256Signer("abc");
  const logger = new ConsoleLoggerAdapter();
  await TestHelpers.withTempRoot(async (client) => {
    let dialogRet = "";
    const driver = await LsDriver.init(
      logger,
      client,
      signer,
      [{ storageId: "test_storage", localPath: path.join(assetsPath, "ls_dir_structure_test") }],
      async () => [dialogRet],
    );

    {
      dialogRet = path.join(assetsPath, "ls_dir_structure_test", "abc", "42.txt");
      const result = await driver.showOpenSingleFileDialog();
      expect(result.file).toBeDefined();

      expect(isImportFileHandleIndex(result.file!)).toStrictEqual(true);
      const size = await driver.getLocalFileSize(result.file!);
      expect(size).toStrictEqual(3);
      const content = await driver.getLocalFileContent(result.file!);
      expect(Buffer.from(content).toString()).toStrictEqual("42\n");
    }

    {
      dialogRet = path.join(assetsPath, "answer_to_the_ultimate_question.txt");
      const result = await driver.showOpenSingleFileDialog();
      expect(result.file).toBeDefined();

      expect(isImportFileHandleUpload(result.file!)).toStrictEqual(true);
      const size = await driver.getLocalFileSize(result.file!);
      expect(size).toStrictEqual(3);
      const content = await driver.getLocalFileContent(result.file!);
      expect(Buffer.from(content).toString()).toStrictEqual("42\n");
    }
  });
});

test("should ok when get file using local dialog, and read its content", async () => {
  const signer = new HmacSha256Signer("abc");
  const logger = new ConsoleLoggerAdapter();
  await TestHelpers.withTempRoot(async (client) => {
    const driver = await LsDriver.init(logger, client, signer, [], async () => [
      path.join(assetsPath, "answer_to_the_ultimate_question.txt"),
    ]);

    const result = await driver.showOpenSingleFileDialog();
    expect(result.file).toBeDefined();

    const size = await driver.getLocalFileSize(result.file!);
    expect(size).toStrictEqual(3);
    const content = await driver.getLocalFileContent(result.file!);
    expect(Buffer.from(content).toString()).toStrictEqual("42\n");

    const multiResult = await driver.showOpenMultipleFilesDialog();
    expect(multiResult.files![0]).toStrictEqual(result.file);
  });
});

// Unit tests: verify that LsDriver.listFiles and listRemoteFilesWithFileStats correctly
// thread additionalInfo from gRPC list items into the index:// handle.
describe("LsDriver additionalInfo threading", () => {
  const envelope = { uid: "u1", sid: "s1", sig: "sigval", exp: "9999999999", kid: "k1", v: "1" };

  const storageInfo = {
    storageId: "test-storage",
    storageName: "Test Storage",
    // Signed resource id format "<globalId>|<signatureHex>" — required by asSignedResourceId.
    resourceId: "res-id|deadbeef" as any,
    resourceType: { name: "LS/test-storage", version: "1" },
  };

  // Builds a minimal LsDriver instance with an injected mock lsClient via private-constructor bypass.
  function makeMockDriver(listResponse: { items: any[]; delimiter: string }): LsDriver {
    const mockLsClient = {
      list: async () => listResponse,
      close: () => {},
    };
    const mockUserResources = {
      getDataLibraries: async () => new Map([[storageInfo.storageId, storageInfo]]),
    };
    const signer = new HmacSha256Signer("test");
    // Bypass private constructor for unit testing only.
    return new (LsDriver as any)(
      new ConsoleLoggerAdapter(),
      mockLsClient,
      mockUserResources,
      signer,
      new Map(),
      new Map(),
      () => Promise.resolve(undefined),
    ) as LsDriver;
  }

  function makeRemoteHandle(): StorageHandle {
    return createRemoteStorageHandle(storageInfo) as StorageHandle;
  }

  test("listFiles: handle carries additionalInfo envelope from gRPC item", async () => {
    const driver = makeMockDriver({
      delimiter: "/",
      items: [
        {
          name: "file.txt",
          size: 100n,
          isDir: false,
          additionalInfo: envelope,
          fullName: "dir/file.txt",
          directory: "dir/",
          version: "v1",
        },
      ],
    });

    const result = await driver.listFiles(makeRemoteHandle(), "dir/");
    expect(result.entries).toHaveLength(1);

    const parsed = parseIndexHandle(result.entries[0].handle as any);
    expect(parsed.additionalInfo).toEqual(envelope);
  });

  test("listFiles: handle has no additionalInfo when item has empty envelope", async () => {
    const driver = makeMockDriver({
      delimiter: "/",
      items: [
        {
          name: "plain.txt",
          size: 50n,
          isDir: false,
          additionalInfo: {},
          fullName: "plain.txt",
          directory: "",
          version: "v1",
        },
      ],
    });

    const result = await driver.listFiles(makeRemoteHandle(), "");
    expect(result.entries).toHaveLength(1);

    const parsed = parseIndexHandle(result.entries[0].handle as any);
    expect(parsed.additionalInfo).toBeUndefined();
  });

  test("listRemoteFilesWithFileStats: handle carries additionalInfo envelope", async () => {
    const driver = makeMockDriver({
      delimiter: "/",
      items: [
        {
          name: "data.csv",
          size: 200n,
          isDir: false,
          additionalInfo: envelope,
          fullName: "data.csv",
          directory: "",
          version: "v2",
        },
      ],
    });

    const result = await driver.listRemoteFilesWithFileStats(makeRemoteHandle(), "");
    expect(result.entries).toHaveLength(1);
    expect((result.entries[0] as LsEntryWithFileStats).size).toBe(200);

    const parsed = parseIndexHandle(result.entries[0].handle as any);
    expect(parsed.additionalInfo).toEqual(envelope);
  });

  test("listRemoteFilesWithFileStats: no additionalInfo when absent in item", async () => {
    const driver = makeMockDriver({
      delimiter: "/",
      items: [
        {
          name: "plain.csv",
          size: 10n,
          isDir: false,
          additionalInfo: {},
          fullName: "plain.csv",
          directory: "",
          version: "v1",
        },
      ],
    });

    const result = await driver.listRemoteFilesWithFileStats(makeRemoteHandle(), "");
    expect(result.entries).toHaveLength(1);

    const parsed = parseIndexHandle(result.entries[0].handle as any);
    expect(parsed.additionalInfo).toBeUndefined();
  });
});
