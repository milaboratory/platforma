<script lang="ts" setup>
import { MaskIcon, PlBtnSecondary } from '@milaboratory/platforma-uikit';
import { strings } from '@milaboratory/helpers';
import { computed } from 'vue';

const emit = defineEmits(['update:modelValue']);

type ModelType = null | {
  fileName: string;
  content: unknown;
};

const props = withDefaults(
  defineProps<{
    label: string;
    modelValue: ModelType;
  }>(),
  {
    modelValue: null,
    label: 'Drag & drop file here',
  },
);

const hasContent = computed(() => props.modelValue && props.modelValue.content);

const fileName = computed(() => props.modelValue?.fileName || '***');

const _updateModel = (v: ModelType) => {
  emit('update:modelValue', v);
};

async function onDrop(e: DragEvent) {
  e.preventDefault();

  const paths = strings.extractPaths(e, ['yaml']);

  if (paths[0]) {
    // api.getFileStringContent(paths[0]).then((content) => {
    //   updateModel(
    //     content
    //       ? {
    //           fileName: strings.extractFileName(paths[0]),
    //           content: yaml.load(content),
    //         }
    //       : null,
    //   );
    // });
  }
}

function onClickSelect() {
  // api.openFileAndGetStringContent(['yaml', 'yml']).then((v) => {
  //   if (v) {
  //     updateModel({
  //       fileName: v.name,
  //       content: yaml.load(v.content),
  //     });
  //   } else {
  //     updateModel(null);
  //   }
  // });
}

function clear() {
  emit('update:modelValue', null);
}
</script>

<template>
  <div class="file-content-input">
    <div v-if="hasContent" class="file-content-input__file">
      <MaskIcon name="paper-clip" />
      <span>{{ fileName }}</span>
      <MaskIcon name="clear" @click.stop="clear" />
    </div>
    <div v-else class="file-content-input__select" @dragenter.prevent @dragover.prevent @drop="onDrop">
      {{ label }}
      <PlBtnSecondary small @click.stop="onClickSelect"> Select file </PlBtnSecondary>
    </div>
  </div>
</template>
