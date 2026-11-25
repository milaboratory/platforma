import { describe, expect, test } from "vitest";
import {
  collectDroppedFiles,
  isJunkName,
  mapWithConcurrency,
  type DirectoryEntryLike,
  type EntryLike,
  type FileEntryLike,
} from "./folder-walk";

// Fixtures mirror the browser's FileSystemEntry shapes. Directory readers hand out
// entries in batches of at most 100, like Chromium's readEntries.
const READ_BATCH = 100;

function fileEntry(name: string): FileEntryLike {
  return {
    name,
    isFile: true,
    isDirectory: false,
    file: (success) => success(new File(["x"], name)),
  };
}

function dirEntry(name: string, children: EntryLike[]): DirectoryEntryLike {
  return {
    name,
    isFile: false,
    isDirectory: true,
    createReader: () => {
      let offset = 0;
      return {
        readEntries: (success) => {
          const batch = children.slice(offset, offset + READ_BATCH);
          offset += batch.length;
          success(batch);
        },
      };
    },
  };
}

function folderOf(name: string, count: number): DirectoryEntryLike {
  return dirEntry(
    name,
    Array.from({ length: count }, (_, i) => fileEntry(`W${String(i + 1).padStart(3, "0")}.ab1`)),
  );
}

const names = (files: File[]) => files.map((f) => f.name);

describe("collectDroppedFiles", () => {
  test("reads a folder past the 100-entry batch limit", async () => {
    const { files } = await collectDroppedFiles([folderOf("plate1", 384)], {
      extensions: undefined,
      allowFolders: true,
    });
    expect(files).toHaveLength(384);
  });

  test("walks nested folders and keeps top-level files", async () => {
    const drop = [
      fileEntry("lone.ab1"),
      dirEntry("plates", [folderOf("plate1", 2), dirEntry("plate2", [folderOf("sub", 1)])]),
    ];
    const { files } = await collectDroppedFiles(drop, {
      extensions: undefined,
      allowFolders: true,
    });
    expect(names(files)).toEqual(["lone.ab1", "W001.ab1", "W002.ab1", "W001.ab1"]);
  });

  test("filters by extension at every level", async () => {
    const drop = [
      fileEntry("notes.txt"),
      fileEntry("A01.ab1"),
      dirEntry("plate", [fileEntry("B01.ab1"), fileEntry("report.pdf")]),
    ];
    const { files } = await collectDroppedFiles(drop, { extensions: [".ab1"], allowFolders: true });
    expect(names(files)).toEqual(["A01.ab1", "B01.ab1"]);
  });

  test("skips hidden entries and __MACOSX inside folders", async () => {
    const drop = [
      dirEntry("plate", [
        fileEntry(".DS_Store"),
        fileEntry("A01.ab1"),
        dirEntry(".hidden", [fileEntry("X.ab1")]),
        dirEntry("__MACOSX", [fileEntry("._A01.ab1")]),
      ]),
    ];
    const { files } = await collectDroppedFiles(drop, {
      extensions: undefined,
      allowFolders: true,
    });
    expect(names(files)).toEqual(["A01.ab1"]);
  });

  test("skips folders when folders are not allowed", async () => {
    const drop = [fileEntry("A01.ab1"), folderOf("plate1", 3)];
    const result = await collectDroppedFiles(drop, { extensions: undefined, allowFolders: false });
    expect(names(result.files)).toEqual(["A01.ab1"]);
    expect(result.skippedFolders).toBe(1);
  });

  test("an empty folder yields nothing", async () => {
    const { files } = await collectDroppedFiles([dirEntry("empty", [])], {
      extensions: undefined,
      allowFolders: true,
    });
    expect(files).toEqual([]);
  });

  test("a reader error rejects", async () => {
    const broken: DirectoryEntryLike = {
      name: "broken",
      isFile: false,
      isDirectory: true,
      createReader: () => ({
        readEntries: (_success, error) => error?.(new DOMException("denied", "NotReadableError")),
      }),
    };
    await expect(
      collectDroppedFiles([broken], { extensions: undefined, allowFolders: true }),
    ).rejects.toThrow("denied");
  });
});

describe("mapWithConcurrency", () => {
  test("keeps order and never exceeds the limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 8 - n));
      inFlight--;
      return n * 10;
    });
    expect(result).toEqual([10, 20, 30, 40, 50, 60, 70]);
    expect(peak).toBe(3);
  });

  test("isJunkName skips system entries of macOS, Windows and Linux, ignoring case", () => {
    for (const name of [
      ".DS_Store",
      "._IGH.ab1",
      "__MACOSX",
      "$RECYCLE.BIN",
      "System Volume Information",
      "lost+found",
      "Thumbs.db",
      "desktop.ini",
      "~$samples.xlsx",
    ]) {
      expect(isJunkName(name), name).toBe(true);
    }
    for (const name of ["IGH.ab1", "plate-1", "recycle", "my~$notes.txt", "samples.xlsx~"]) {
      expect(isJunkName(name), name).toBe(false);
    }
  });
});
