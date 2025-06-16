<script lang="ts" setup>
import { useTransformedModel } from '../../composition/useTransformedModel';
import style from './pl-editable-title.module.scss';
import { computed, ref } from 'vue';

const model = defineModel<string>();

const props = withDefaults(
  defineProps<{
    /**
     * Standard input placeholder
     */
    placeholder?: string;
    /**
     * Any css `width` value (px, %), default is 80%
     */
    maxWidth?: string;
    /**
     * Fixed non-editable prefix
     */
    prefix?: string;
    /**
     * Max title length (default is 1000)
     */
    maxLength?: number;
    /**
     * Min title length
     */
    minLength?: number;
  }>(),
  {
    placeholder: 'Title',
    maxWidth: '80%',
    prefix: undefined,
    maxLength: 1000,
    minLength: undefined,
  },
);

const local = useTransformedModel(model, {
  update() {
    return false;
  },
  parse: (v): string => {
    if (typeof v !== 'string') {
      throw Error('value should be a string');
    }

    if (props.maxLength && v.length > props.maxLength) {
      throw Error(`Max title length is ${props.maxLength} characters`);
    }

    if (props.minLength && v.length < props.minLength) {
      throw Error(`Min title length is ${props.minLength} characters`);
    }

    return v.trim();
  },
});

const computedStyle = computed(() => ({
  maxWidth: props.maxWidth ?? '80%',
}));

const save = () => {
  model.value = local.value && !local.error ? local.value : model.value;
  local.reset();
};

const inputRef = ref<HTMLInputElement>();
</script>

<template>
  <div class="pl-editable-title" :class="style.component" :style="computedStyle">
    <div :class="style.container" @click="() => inputRef?.focus()">
      <span v-if="prefix">{{ prefix.trim() }}&nbsp;</span>
      <input
        ref="inputRef"
        v-model="local.value"
        :placeholder="placeholder"
        @focusout="save"
        @keydown.escape="local.reset"
        @keydown.enter="(ev) => (ev.target as HTMLInputElement)?.blur()"
      />
    </div>
    <div v-if="local.error" :class="style.error">{{ local.error }}</div>
  </div>
</template>
