<script setup lang="ts">
import DoubleContour from '../utils/DoubleContour.vue';
import { useLabelNotch } from '@/composition/useLabelNotch';
import { computed, nextTick, ref, useSlots } from 'vue';
import Tooltip from '@/components/Tooltip.vue';

type NumberInputProps = {
  modelValue: number | undefined;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  step?: number;
  minValue?: number;
  maxValue?: number;
  errorMessage?: string;
  validate?: (v: number) => string | undefined;
};

const props = withDefaults(defineProps<NumberInputProps>(), {
  step: 1,
  label: undefined,
  placeholder: undefined,
  minValue: undefined,
  maxValue: undefined,
  errorMessage: undefined,
  validate: undefined,
});

const emit = defineEmits<{ (e: 'update:modelValue', number?: number): void }>();

const root = ref<HTMLElement>();
const slots = useSlots();
const input = ref<HTMLInputElement>();
// const localErrors = ref<string[]>([]);

useLabelNotch(root);

const canRenderValue = ref(true);

const computedValue = computed({
  get() {
    if (canRenderValue.value) {
      if (props.modelValue !== undefined) {
        const num = new Number(props.modelValue);
        return num.toString();
      }
      return '';
    }
    return '';
  },
  set(val) {
    val = val.replace(/,/g, '');
    if (isNumeric(val)) {
      emit('update:modelValue', +val);
      //try press 123.12345678912345 and than 6
      if (
        val.toString() !== props.modelValue?.toString() &&
        +val === props.modelValue &&
        val[val.length - 1] !== '.'
      ) {
        canRenderValue.value = false;
        nextTick(() => {
          canRenderValue.value = true;
        });
      }
    } else {
      if (val.trim() === '') {
        emit('update:modelValue', undefined);
      }
      canRenderValue.value = false;
      nextTick(() => {
        canRenderValue.value = true;
      });
    }
  },
});

const errors = computed(() => {
  let ers: string[] = [];
  if (props.errorMessage) {
    ers.push(props.errorMessage);
  }
  if (!isNumeric(props.modelValue)) {
    ers.push('Model value is not a number.');
  } else {
    if (
      props.minValue !== undefined &&
      props.modelValue !== undefined &&
      props.modelValue < props.minValue
    ) {
      ers.push(`Model value must be higher than ${props.minValue}`);
    }
    if (
      props.maxValue !== undefined &&
      props.modelValue !== undefined &&
      props.modelValue > props.maxValue
    ) {
      ers.push(`Model value must be less than ${props.maxValue}`);
    }
  }

  ers = [...ers];

  return ers.join(' ');
});

const isIncrementDisabled = computed(() => {
  if (props.maxValue && props.modelValue !== undefined) {
    if ((props.modelValue || 0) + props.step > props.maxValue) {
      return true;
    }
  }

  return false;
});

const isDecrementDisabled = computed(() => {
  if (props.minValue && props.modelValue !== undefined) {
    if ((props.modelValue || 0) - props.step < props.minValue) {
      return true;
    }
  }

  return false;
});

function isNumeric(str: string | number | undefined) {
  if (str !== undefined) {
    str = str?.toString();
    return !isNaN(+str) && !isNaN(parseFloat(str));
  }
  return false;
}

function increment() {
  if (!isIncrementDisabled.value) {
    let nV = 0;
    if (props.modelValue === undefined) {
      nV = props.minValue ? props.minValue : 0;
    } else {
      nV = +(props.modelValue || 0) + props.step;
    }

    computedValue.value = nV.toString();
  }
}

function decrement() {
  if (!isDecrementDisabled.value) {
    let nV = 0;
    if (props.modelValue === undefined) {
      nV = 0;
    } else {
      nV = +(props.modelValue || 0) - props.step;
    }

    computedValue.value = props.minValue
      ? Math.max(props.minValue, nV).toString()
      : nV.toString();
  }
}

function handleKeyPress(e: { code: string; preventDefault(): void }) {
  if (['ArrowDown', 'ArrowUp'].includes(e.code)) {
    e.preventDefault();
  }

  e.code === 'ArrowUp'
    ? increment()
    : e.code === 'ArrowDown'
      ? decrement()
      : undefined;
}
</script>

<template>
  <div
    ref="root"
    :class="{ error: !!errors.trim(), disabled: disabled }"
    class="mi-number-field d-flex-column"
    @keydown="handleKeyPress($event)"
  >
    <div class="mi-number-field__main-wrapper d-flex">
      <DoubleContour class="mi-number-field__contour" />
      <div class="mi-number-field__wrapper flex-grow d-flex flex-align-center">
        <label v-if="label" class="text-description">
          {{ label }}
          <Tooltip v-if="slots.tooltip" class="info" position="top">
            <template #tooltip>
              <slot name="tooltip" />
            </template>
          </Tooltip>
        </label>
        <input
          ref="input"
          v-model="computedValue"
          :disabled="disabled"
          :placeholder="placeholder"
          class="text-s flex-grow"
        />
      </div>
      <div class="mi-number-field__icons d-flex-column">
        <div
          :class="{ disabled: isIncrementDisabled }"
          class="mi-number-field__icon d-flex flex-justify-center uc-pointer flex-grow flex-align-center"
          @click="increment"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
          >
            <path
              fill-rule="evenodd"
              clip-rule="evenodd"
              d="M8 4.93933L13.5303 10.4697L12.4697 11.5303L8 7.06065L3.53033 11.5303L2.46967 10.4697L8 4.93933Z"
              fill="#110529"
            />
          </svg>
        </div>
        <div
          :class="{ disabled: isDecrementDisabled }"
          class="mi-number-field__icon d-flex flex-justify-center uc-pointer flex-grow flex-align-center"
          @click="decrement"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
          >
            <path
              fill-rule="evenodd"
              clip-rule="evenodd"
              d="M2.46967 6.53033L3.53033 5.46967L8 9.93934L12.4697 5.46967L13.5303 6.53033L8 12.0607L2.46967 6.53033Z"
              fill="#110529"
            />
          </svg>
        </div>
      </div>
    </div>
    <div v-if="errors.trim()" class="mi-number-field__hint text-description">
      {{ errors }}
    </div>
  </div>
</template>
