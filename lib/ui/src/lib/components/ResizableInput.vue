<template>
    <div class="resizable-input">
        <span class="resizable-input__size-span">{{ text }}</span>
        <input v-bind="$attrs" :placeholder="placeholder" :value="props.value" :disabled="props.disabled"
            @input="handleInput" />
    </div>
</template>

<script setup lang="ts">
import { PropType, computed } from 'vue';

const props = defineProps({
    modelValue: {
        type: String as PropType<string>
    },
    placeholder: {
        type: String as PropType<string>
    },
    value: {
        type: String as PropType<string>
    },
    disabled: {
        type: Boolean as PropType<boolean>
    }
});
const emit = defineEmits(['input', 'update:modelValue']);
const text = computed(() => props.modelValue || props.value);
function handleInput(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    emit('input', value);
    emit('update:modelValue', value);

    console.log(value, props.modelValue);
}
</script>