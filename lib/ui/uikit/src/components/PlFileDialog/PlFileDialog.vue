<script lang="ts" setup>
import style from "./pl-file-dialog.module.scss";
import { computed, shallowRef, useTemplateRef } from "vue";
import { notEmpty } from "@milaboratories/helpers";
import type { ImportedFiles, SimpleOption } from "../../types";
import { PlDialogModal } from "../PlDialogModal";
import { PlBtnPrimary } from "../PlBtnPrimary";
import { PlBtnGhost } from "../PlBtnGhost";
import { PlBtnGroup } from "../PlBtnGroup";
import Remote from "./Remote.vue";
import Local from "./Local.vue";

const props = withDefaults(
  defineProps<{
    /**
     * Controls the visibility of the modal.
     *
     * When `true`, the modal is open. When `false`, the modal is closed.
     */
    modelValue: boolean;
    /**
     * Called when the modal asks to open or close; `v-model` binds it.
     */
    "onUpdate:modelValue"?: (value: boolean) => void;
    /**
     * Called with the files to import, right before the modal closes;
     * `@import:files` binds it.
     */
    "onImport:files"?: (value: ImportedFiles) => void;
    /**
     * Specifies the file extensions that are allowed for selection.
     *
     * Provide an array of strings representing file extensions (leading dot can be omitted)
     * If not specified, all file types are allowed.
     */
    extensions?: string[];
    /**
     * Enables the selection of multiple files.
     *
     * When `true`, the user can select multiple files.
     * When `false` or not specified, only a single file can be selected.
     */
    multi?: boolean;
    /**
     * Lets the user import whole folders, together with `multi`: dropped on the
     * "My Computer" tab, or selected on the "Remote" tab. A folder becomes the files below
     * it, matching `extensions`; hidden and system entries are skipped.
     *
     * Files keep their full paths, so files with the same name from different folders
     * arrive side by side. Turn it on only where the block can tell them apart.
     * Default: `false`.
     */
    allowFolders?: boolean;
    /**
     * The custom title of the dialog.
     */
    title?: string;
    /**
     * Automatically selects the initial storage option.
     * When `true`, the default storage is pre-selected for the user (default: `true`)
     */
    autoSelectStorage?: boolean;
    /**
     * If `true`, the modal window closes when clicking outside the modal area (default: `true`)
     */
    closeOnOutsideClick?: boolean;
  }>(),
  {
    extensions: undefined,
    title: undefined,
    autoSelectStorage: true,
    closeOnOutsideClick: true,
  },
);

const mode = shallowRef<"local" | "remote">("local");

const defaultTitle = computed(() =>
  props.multi ? "Select Files to Import" : "Select File to Import",
);

const modeOptions = [
  {
    label: "My Computer",
    value: "local",
  },
  {
    label: "Remote",
    value: "remote",
  },
] satisfies SimpleOption[];

const closeModal = () => props["onUpdate:modelValue"]?.(false);

const remoteRef = useTemplateRef("remote");

const submit = async () => {
  const remote = remoteRef.value;
  if (!remote?.isReady) return;
  // Undefined when cancelled or nothing to import; Remote shows why.
  const files = await remote.getFilesToImport();
  if (files) importFiles(files);
};

const cancel = () => {
  if (remoteRef.value?.isImporting) remoteRef.value.cancelImport();
  else closeModal();
};

const importFiles = (importedFiles: ImportedFiles) => {
  props["onImport:files"]?.(importedFiles);
  closeModal();
};
</script>

<template>
  <PlDialogModal
    :no-content-gutters="true"
    :close-on-outside-click="closeOnOutsideClick"
    class="pl-dialog-modal"
    data-testid="pl-file-dialog"
    :class="style.component"
    :model-value="modelValue"
    width="688px"
    height="720px"
    @update:model-value="closeModal"
    @click.stop
  >
    <template #title>{{ title ?? defaultTitle }}</template>
    <div style="margin: 0 24px">
      <PlBtnGroup v-model="mode" :options="modeOptions" data-testid="pl-file-dialog-mode" />
    </div>
    <Remote
      v-if="mode === 'remote'"
      ref="remote"
      :model-value="modelValue"
      :extensions="extensions"
      :multi="multi"
      :allow-folders="allowFolders"
      :auto-select-storage="autoSelectStorage"
      :submit="submit"
    />
    <Local
      v-if="mode === 'local'"
      :import-files="importFiles"
      :extensions="extensions"
      :multi="multi"
      :allow-folders="allowFolders"
    />
    <template v-if="mode === 'remote'" #actions>
      <PlBtnPrimary
        style="min-width: 160px"
        :disabled="!remoteRef?.isReady"
        :loading="remoteRef?.isImporting"
        data-testid="pl-file-dialog-import"
        @click.stop="submit"
        >Import</PlBtnPrimary
      >
      <PlBtnGhost :justify-center="false" data-testid="pl-file-dialog-cancel" @click.stop="cancel"
        >Cancel</PlBtnGhost
      >
    </template>
  </PlDialogModal>
</template>
