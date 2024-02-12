<template>
    <div ref="container" :class="classes" class="ui-select-input-line uc-pointer" @click="toggleList">
        <div class="ui-select-input-line__prefix">
            {{ props.prefix }}
        </div>
        <input :value="selectedValues" :placeholder="props.placeholder" :disabled="props.disabled" type="text"
            class="ui-select-input-line__input" @input="setSearchPhrase">
        <div class="ui-select-input-line__icon-wrapper">
            <div class="ui-select-input-line__icon" @click="toggleList" />
        </div>

        <div v-if="props.mode === 'list'" v-show="data.isOpen" class="ui-select-input-line__items">
            <div v-for="(item, index) in items" :key="index" :class="getClassForSelectedItem(item)"
                class="ui-select-input-line__item" @click.stop="selectItem(item)">
                <div class="ui-select-input-line__item-title">
                    {{ item[props.itemText] }}
                </div>
                <div v-if="isItemSelected(item)" class="ui-select-input-line__item-icon"></div>
            </div>
        </div>

        <div v-if="props.mode === 'tabs'" v-show="data.isOpen" class="ui-select-input-line__items-tabs">
            <div v-for="(item, index) in items" :key="index" :class="getClassForSelectedItem(item)"
                class="ui-select-input-line__item-tab" @click.stop="selectItem(item)">
                <div class="ui-select-input-line__item-title">
                    {{ item[props.itemText] }}
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, reactive, PropType, ref, Ref } from 'vue';
import { SelectInputItem } from '@/lib/types';
import { deepEqual } from '@/lib/helpers/objects';
import { useClickOutside } from '@/lib/composition/useClickOuside';
import { useFilteredList } from '@/lib/composition/useFilteredList';

const props = defineProps({
    modelValue: {
        type: Array as PropType<SelectInputItem[]>,
        required: true
    },
    disabled: {
        type: Boolean as PropType<boolean>,
        default: false,
    },
    prefix: {
        type: String as PropType<string>
    },
    items: {
        type: Array as PropType<SelectInputItem[]>,
        default: (() => []),
    },
    itemText: {
        type: String as PropType<string>,
        default: 'text',
    },
    itemValue: {
        type: String as PropType<string>,
        default: 'value'
    },
    placeholder: {
        type: String as PropType<string>,
        default: 'Select...'
    },
    mode: {
        type: String as PropType<'list' | 'tabs'>,
        default: 'list'
    }
});
const emit = defineEmits(['update:modelValue'])
const data = reactive({
    isOpen: false
});
const container = ref<HTMLElement | null>(null);
const classes = computed(() => {
    const classesResult = [];
    if (props.modelValue.length > 0) {
        classesResult.push('active');
    }
    if (data.isOpen) {
        classesResult.push('open');
    }
    if (props.disabled) {
        classesResult.push('disabled');
    }
    return classesResult.join(' ');
});

const searchPhrase = ref<string>('');

const items = useFilteredList(props.items, searchPhrase, 'text');

const selectedValues = computed<string>(() => {
    if (searchPhrase.value) {
        return searchPhrase.value;
    }
    if (props.modelValue?.length > 0) {
        return props.modelValue[0][props.itemText];
    }
    return '';
});

function getClassForSelectedItem(item: SelectInputItem): string {
    const result = isItemSelected(item);
    if (result) {
        return 'ui-select-input-line__item-active';
    }
    return '';
}
function setSearchPhrase(event: Event) {
    searchPhrase.value = (event.target as HTMLInputElement).value;
    if (!searchPhrase.value) {
        selectItem();
    }
}

function toggleList(): void {
    if (props.disabled) {
        data.isOpen = false;
    } else {
        data.isOpen = true;
    }
}

useClickOutside(container as Ref<HTMLElement>, () => {
    data.isOpen = false;
});

function selectItem(item?: SelectInputItem): void {
    if (item) {
        emit('update:modelValue', [item]);
        searchPhrase.value = '';
    } else {
        emit('update:modelValue', []);
    }

    if (props.mode === 'list') {
        data.isOpen = false;
    }
}

function isItemSelected(item: SelectInputItem): boolean {
    if (props.modelValue?.findIndex((el) => deepEqual(el[props.itemValue], item[props.itemValue])) !== -1) {
        return true;
    }
    return false;
}
</script>