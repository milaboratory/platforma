<script setup lang="ts">
import { PlBtnSecondary } from '@/components/PlBtnSecondary';
import { PlBtnGhost } from '@/components/PlBtnGhost';
import { computed, ref } from 'vue';

type PropsType = {
  modelValue: File[] | null;
  title?: string;
  description?: string;
  acceptedTypes?: string;
  multiple?: boolean;
  buttonText?: string;
  disabled?: boolean;
};

const props = withDefaults(defineProps<PropsType>(), {
  modelValue: null,
  title: 'FASTQ',
  description: 'Drag & drop FASTQ files here or...',
  multiple: false,
  acceptedTypes: '',
  buttonText: 'Select local file',
});

const emit = defineEmits<{
  (e: 'update:modelValue', files: File[] | null): void;
  (e: 'selected', files: File[]): void;
}>();

const fileInput = ref<HTMLInputElement>();
const dragging = ref(false);

const hasFiles = computed(() => props.modelValue && props.modelValue.length > 0);
function triggerFileInput() {
  fileInput.value?.click();
}

function handleFiles(event: Event) {
  const target = event.target as HTMLInputElement;
  const files = target.files || (event as DragEvent).dataTransfer?.files;

  if (files) {
    const filteredFiles = filterFiles(Array.from(files));
    if (!props.multiple) {
      filteredFiles.length = 1;
    }
    emit('update:modelValue', filteredFiles);
    emit('selected', filteredFiles);
  }

  dragging.value = false;
}

function handleDrop(event: DragEvent) {
  event.preventDefault();
  dragging.value = false;
  handleFiles(event);
}

function filterFiles(files: File[]): File[] {
  if (!props.acceptedTypes) return files;
  const acceptedTypesArray = props.acceptedTypes.split(',').map((type) => type.trim());
  return Array.from(files).filter((file) => {
    return acceptedTypesArray.some((type) => {
      if (type.includes('/*')) {
        // Шаблон типа, например, 'image/*'
        return file.type.startsWith(type.split('/')[0]);
      }
      return file.type === type;
    });
  });
}

function deleteFile(file: File) {
  if (file && props.modelValue && props.modelValue.length > 0) {
    const i = props.modelValue.findIndex((f) => f === file);
    if (i !== -1) {
      let arr = [...props.modelValue];
      arr.splice(i, 1);
      emit('update:modelValue', arr);
    }
  }
}
</script>
<template>
  <div
    :class="{ dragging: dragging, active: hasFiles, disabled }"
    class="pl-file-base-input"
    @dragover.prevent="dragging = true"
    @dragenter.prevent
    @dragleave="dragging = false"
    @drop="handleDrop"
    @click="triggerFileInput"
  >
    <div class="d-flex">
      <div class="pl-file-base-input__text flex-grow-1">
        <div class="pl-file-base-input__title text-subtitle-s">{{ title }}</div>
        <div class="pl-file-base-input__description text-description">
          {{ description }}
        </div>
      </div>
      <div class="pl-file-base-input__buttons d-flex gap-2">
        <input ref="fileInput" :multiple="multiple" :accept="acceptedTypes" type="file" @change="handleFiles" />
        <PlBtnSecondary :disabled="disabled" class="text-caps11">
          {{ buttonText }}
        </PlBtnSecondary>
        <slot name="actions" />
      </div>
    </div>

    <div v-if="hasFiles" class="d-flex gap-2 pa-4 flex-wrap">
      <div v-for="file in modelValue" :key="file.name" class="pl-file-base-input__file d-flex align-center">
        <div class="pl-file-base-input__file-name text-m">
          {{ file.name }}
        </div>
        <PlBtnGhost :disabled="disabled" icon="close" round size="small" class="flex-shrink-0" @click.stop="deleteFile(file)" />
      </div>
    </div>
  </div>
</template>
