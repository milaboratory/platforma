import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import type {
  ImportFileHandle,
  ListFilesResult,
  LsEntry,
  StorageEntry,
} from "@platforma-sdk/model";
import PlFileDialog from "../PlFileDialog.vue";
import type { ImportedFiles } from "../../../types";

/** Full file paths of the fake remote storage; folders are implied. */
const files = [
  "a.ab1",
  "b.ab1",
  "c.ab1",
  "notes.txt",
  "plate/A01/IGH.ab1",
  "plate/A02/IGH.ab1",
  "plate/readme.md",
];

const handleOf = (path: string): ImportFileHandle => `index://index/${encodeURIComponent(path)}`;

const pathOf = (handle: ImportFileHandle) =>
  decodeURIComponent(handle.slice("index://index/".length));

const listFiles = async (_storage: unknown, dir: string): Promise<ListFilesResult> => {
  const prefix = dir === "" ? "" : dir + "/";
  const children = new Map<string, LsEntry>();
  for (const p of files) {
    if (!p.startsWith(prefix)) continue;
    const [name, ...rest] = p.slice(prefix.length).split("/");
    const fullPath = prefix + name;
    children.set(
      name,
      rest.length > 0
        ? { type: "dir", name, fullPath }
        : { type: "file", name, fullPath, handle: handleOf(fullPath) },
    );
  }
  return { entries: [...children.values()] };
};

const storage: StorageEntry = {
  id: "remote",
  name: "Remote",
  handle: "remote://test",
  initialFullPath: "",
};

vi.mock("@platforma-sdk/model", async (importOriginal) => ({
  ...(await importOriginal()),
  getRawPlatformaInstance: () => ({
    lsDriver: { getStorageList: async () => [storage], listFiles },
  }),
}));

describe("PlFileDialog, remote tab", () => {
  let wrapper: VueWrapper | undefined;
  let imported: ImportedFiles[];
  let visibility: boolean[];

  beforeEach(() => {
    imported = [];
    visibility = [];
  });

  afterEach(() => {
    wrapper?.unmount();
    document.body.innerHTML = "";
  });

  const open = async (props: { multi?: boolean; allowFolders?: boolean } = {}) => {
    wrapper = mount(PlFileDialog, {
      attachTo: document.body,
      props: {
        modelValue: true,
        extensions: [".ab1"],
        ...props,
        "onImport:files": (value: ImportedFiles) => imported.push(value),
        "onUpdate:modelValue": (value: boolean) => visibility.push(value),
      },
    });
    await flushPromises();
    const remoteTab = [...document.body.querySelectorAll("[data-testid=pl-file-dialog-mode] *")]
      .filter((el): el is HTMLElement => el instanceof HTMLElement)
      .find((el) => el.textContent?.trim() === "Remote" && el.children.length === 0);
    remoteTab?.click();
    await flushPromises();
  };

  const rows = (testId: string) =>
    [...document.body.querySelectorAll(`[data-testid=${testId}]`)].filter(
      (el): el is HTMLElement => el instanceof HTMLElement,
    );

  const row = (testId: string, name: string) => {
    const found = rows(testId).find((el) => el.textContent?.includes(name));
    if (!found) throw new Error(`No ${testId} row named ${name}`);
    return found;
  };

  const click = async (el: HTMLElement, init: MouseEventInit = {}) => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1, ...init }));
    await flushPromises();
  };

  const selectedCount = () =>
    document.body.querySelector("[data-testid=pl-file-dialog-selected-count]")?.textContent;

  const importSelected = async () => {
    const button = document.body.querySelector("[data-testid=pl-file-dialog-import]");
    if (!(button instanceof HTMLElement)) throw new Error("No Import button");
    await click(button);
    await flushPromises();
  };

  test("a plain click selects one file, Ctrl and Shift add to it", async () => {
    await open({ multi: true });
    await click(row("pl-file-dialog-file", "a.ab1"));
    await click(row("pl-file-dialog-file", "b.ab1"));
    expect(selectedCount()).toBe("Selected: 1");

    await click(row("pl-file-dialog-file", "a.ab1"));
    await click(row("pl-file-dialog-file", "c.ab1"), { shiftKey: true });
    expect(selectedCount()).toBe("Selected: 3");

    await click(row("pl-file-dialog-file", "b.ab1"), { metaKey: true });
    expect(selectedCount()).toBe("Selected: 2");

    // A file outside the extensions cannot be selected.
    await click(row("pl-file-dialog-file", "notes.txt"), { metaKey: true });
    expect(selectedCount()).toBe("Selected: 2");

    await importSelected();
    expect(imported.map((i) => i.files.map(pathOf))).toEqual([["a.ab1", "c.ab1"]]);
    expect(visibility).toEqual([false]);
  });

  test("single mode keeps one file", async () => {
    await open();
    await click(row("pl-file-dialog-file", "a.ab1"));
    await click(row("pl-file-dialog-file", "b.ab1"), { metaKey: true });
    await click(row("pl-file-dialog-file", "b.ab1"));
    expect(selectedCount()).toBe("Selected: 1");
    await importSelected();
    expect(imported.map((i) => i.files.map(pathOf))).toEqual([["b.ab1"]]);
  });

  test("folders cannot be selected without allowFolders", async () => {
    await open({ multi: true });
    await click(row("pl-file-dialog-dir", "plate"));
    // The folder opened instead of being selected.
    expect(rows("pl-file-dialog-dir").map((el) => el.textContent?.trim())).toEqual(["A01", "A02"]);
    expect(selectedCount()).toBe("Selected: 0");
  });

  test("a selected folder is imported as its files", async () => {
    await open({ multi: true, allowFolders: true });
    await click(row("pl-file-dialog-dir", "plate"));
    await click(row("pl-file-dialog-file", "a.ab1"), { metaKey: true });
    expect(selectedCount()).toBe("Selected: 3");

    await importSelected();
    expect(imported.map((i) => i.files.map(pathOf))).toEqual([
      ["a.ab1", "plate/A01/IGH.ab1", "plate/A02/IGH.ab1"],
    ]);
  });

  test("opening a selected folder selects its contents", async () => {
    await open({ multi: true, allowFolders: true });
    await click(row("pl-file-dialog-dir", "plate"));
    await click(row("pl-file-dialog-dir-name", "plate"));

    const selected = rows("pl-file-dialog-dir").filter((el) => el.className.includes("selected"));
    expect(selected.map((el) => el.textContent?.trim())).toEqual(["A01", "A02"]);
    expect(selectedCount()).toBe("Selected: 2");

    // Deselecting one subfolder leaves the other.
    await click(row("pl-file-dialog-dir", "A02"), { metaKey: true });
    await importSelected();
    expect(imported.map((i) => i.files.map(pathOf))).toEqual([["plate/A01/IGH.ab1"]]);
  });
});
