<script setup lang="ts">
import style from "./pl-file-dialog.module.scss";
import type { ImportedFiles } from "../../types";
import { PlIcon24 } from "../PlIcon24";
import { computed, reactive } from "vue";
import {
  getRawPlatformaInstance,
  type ImportFileHandle,
  type OpenDialogFilter,
} from "@platforma-sdk/model";
import { normalizeExtensions } from "./utils";
import { collectDroppedFiles, mapWithConcurrency, type EntryLike } from "./folder-walk";

const props = defineProps<{
  importFiles: (value: ImportedFiles) => void;
  multi?: boolean;
  allowFolders?: boolean;
  extensions?: string[];
}>();

const foldersEnabled = computed(() => !!props.multi && !!props.allowFolders);

/** Each handle is a round trip to the main process; a 384-well plate is 384 of them. */
const HANDLE_CONCURRENCY = 16;

const data = reactive({
  error: undefined as unknown,
  collecting: false,
});

const label = computed(() => {
  if (foldersEnabled.value) return "Drag & Drop files or folders here or click to add";
  return props.multi
    ? "Drag & Drop files here or click to add"
    : "Drag & Drop file here or click to add";
});

const toHandles = async (files: File[]): Promise<ImportFileHandle[] | undefined> => {
  const fileToImportHandle = getRawPlatformaInstance()?.lsDriver?.fileToImportHandle;
  if (!fileToImportHandle) {
    console.error("API getPlatformaRawInstance().lsDriver.fileToImportHandle is not available");
    return undefined;
  }
  return mapWithConcurrency(files, HANDLE_CONCURRENCY, (file) => fileToImportHandle(file));
};

const emptyDropMessage = (skippedFolders: number) => {
  if (skippedFolders > 0)
    return `Folders cannot be imported here, drop ${props.multi ? "files" : "a file"}`;
  return props.extensions
    ? `No files with supported formats found (${props.extensions.join(", ")})`
    : "No files found";
};

const onDrop = async (ev: DragEvent) => {
  data.error = undefined;
  // Entries must be taken synchronously: dataTransfer is emptied after the first await.
  const entries: EntryLike[] = [...(ev.dataTransfer?.items ?? [])]
    .map((item) => item.webkitGetAsEntry())
    .filter((entry): entry is FileSystemEntry => entry !== null);

  data.collecting = true;
  try {
    const { files, skippedFolders } = await collectDroppedFiles(entries, {
      extensions: normalizeExtensions(props.extensions),
      allowFolders: foldersEnabled.value,
    });
    if (files.length === 0) {
      data.error = emptyDropMessage(skippedFolders);
      return;
    }
    const handles = await toHandles(files);
    if (handles?.length) props.importFiles({ files: handles });
  } catch (err) {
    data.error = err;
  } finally {
    data.collecting = false;
  }
};

const openNativeDialog = async () => {
  const filters: OpenDialogFilter[] = props.extensions
    ? [
        {
          name: "All Files",
          extensions: [...props.extensions],
        },
      ]
    : [];

  if (props.multi) {
    getRawPlatformaInstance()
      ?.lsDriver.showOpenMultipleFilesDialog({
        title: "Select files to import",
        filters,
      })
      .then(({ files }) => {
        if (files) {
          props.importFiles({
            files,
          });
        }
      })
      .catch((err) => (data.error = err));
  } else {
    getRawPlatformaInstance()
      ?.lsDriver.showOpenSingleFileDialog({
        title: "Select file to import",
        filters,
      })
      .then(({ file }) => {
        if (file) {
          props.importFiles({
            files: [file],
          });
        }
      })
      .catch((err) => (data.error = err));
  }
};
</script>

<template>
  <div
    :class="style.local"
    data-testid="pl-file-dialog-local"
    @drop.prevent="onDrop"
    @dragover.prevent
    @click="openNativeDialog"
  >
    <PlIcon24 name="cloud-upload" />
    <span data-testid="pl-file-dialog-local-label">{{ label }}</span>
    <span v-if="extensions" :class="style.supported" data-testid="pl-file-dialog-local-formats"
      >Supported formats: {{ extensions.join(", ") }}</span
    >
    <span v-if="data.collecting" :class="style.supported" data-testid="pl-file-dialog-local-busy"
      >Collecting files…</span
    >
    <span v-if="data.error" class="alert-error" data-testid="pl-file-dialog-local-error">{{
      data.error
    }}</span>
  </div>
</template>
