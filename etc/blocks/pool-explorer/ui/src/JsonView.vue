<script lang="ts" generic="T" setup>
import * as monaco from 'monaco-editor';
// @ts-expect-error @todo
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import { onMounted, reactive, ref, watchEffect } from 'vue';
import { notEmpty } from '@milaboratories/helpers';

const emit = defineEmits<{
  (e: 'change', value: T): void;
}>();

const props = defineProps<{
  value: T;
}>();

const data = reactive({
  error: '',
});

const raw = {
  editor: undefined as monaco.editor.IStandaloneCodeEditor | undefined,
};

const editorRef = ref<HTMLElement>();

const fold = () => raw.editor?.trigger('fold', 'editor.foldAll', 1);
const unfold = () => raw.editor?.trigger('fold', 'editor.unfoldAll', 1);

defineExpose({
  fold,
  unfold,
});

self.MonacoEnvironment = {
  getWorker(workerId, label) {
    switch (label) {
      case 'json':
        return new jsonWorker();
      default:
        throw Error('Not supported');
    }
  },
};

watchEffect(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  props.value;
  raw.editor?.getModel()?.setValue(JSON.stringify(props.value, null, 2));
});

onMounted(() => {
  const editor = (raw.editor = monaco.editor.create(notEmpty(editorRef.value), {
    value: '',
    language: 'json',
    automaticLayout: true,
    theme: 'vs-dark',
    readOnly: true,
  }));

  editor.getModel()?.setValue(JSON.stringify(props.value, null, 2));

  const getValue = () => {
    try {
      return JSON.parse(editor.getModel()?.getValue() ?? '');
    } catch {
      data.error = 'Invalid json';
      return undefined;
    }
  };

  editor.getModel()?.onDidChangeContent(() => {
    const value = getValue();
    if (value) {
      data.error = '';
      emit('change', value);
    }
  });
});
</script>

<template>
  <div style="display: flex; flex-direction: column; flex: 1; height: 100%">
    <div v-if="data.error" class="alert-error">{{ data.error }}</div>
    <div ref="editorRef" style="flex: 1" />
  </div>
</template>
