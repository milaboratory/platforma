<script lang="ts" generic="T" setup>
import * as monaco from 'monaco-editor';
// @ts-expect-error @todo
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import { onMounted, reactive, ref, watch } from 'vue';
import { notEmpty } from '@milaboratories/helpers';
import escapeStringRegexp from 'escape-string-regexp';

function highlightSubstring(editor: monaco.editor.IStandaloneCodeEditor, key: string) {
  monaco.languages.registerDocumentSemanticTokensProvider('json', {
    getLegend: function () {
      return {
        tokenTypes: ['customHighlight'],
        tokenModifiers: [],
      };
    },
    provideDocumentSemanticTokens: function (model) {
      const lines = model.getLinesContent();
      const tokens: number[] = [];

      if (!key) {
        return { data: new Uint32Array([]) };
      }

      const regex = new RegExp(escapeStringRegexp(key), 'g');

      lines.forEach((line, lineIndex) => {
        let match;
        while ((match = regex.exec(line)) !== null) {
          const startIndex = match.index + 0;
          const length = match[0].length;
          // console.log(key, ' -> match', match, 'push', lineIndex, startIndex, length, 0, 0);
          tokens.push(lineIndex, startIndex, length, 0, 0);
        }
      });

      console.log('tokens', tokens);

      return { data: new Uint32Array(tokens) };
    },
    releaseDocumentSemanticTokens: function () {
    },
  });

  // Trigger a refresh
  monaco.editor.setModelLanguage(editor.getModel()!, 'json');
}

const props = defineProps<{
  value: T;
  highlightString?: string;
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

// Define a custom theme with a highlight style
monaco.editor.defineTheme('custom-theme', {
  base: 'vs-dark',
  inherit: true,
  rules: [{ token: 'customHighlight', foreground: 'ff0000', background: 'ffffff', fontStyle: 'bold' }],
  colors: {},
});

watch(props, () => {
  const editor = raw.editor;

  if (!editor) {
    return;
  }

  editor.getModel()?.setValue(JSON.stringify(props.value, null, 2));

  console.log('key', props.highlightString);

  highlightSubstring(editor, props.highlightString ?? '');
}, { immediate: true });

onMounted(() => {
  const editor = (raw.editor = monaco.editor.create(notEmpty(editorRef.value), {
    'value': '',
    'language': 'json',
    'automaticLayout': true,
    'theme': 'custom-theme',
    'readOnly': true,
    'semanticHighlighting.enabled': true,
  }));

  editor.getModel()?.setValue(JSON.stringify(props.value, null, 2));
});
</script>

<template>
  <div style="display: flex; flex-direction: column; flex: 1; height: 100%">
    <div v-if="data.error" class="alert-error">{{ data.error }}</div>
    <div ref="editorRef" style="flex: 1" />
  </div>
</template>
