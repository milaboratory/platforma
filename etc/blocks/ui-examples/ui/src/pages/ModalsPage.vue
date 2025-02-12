<script setup lang="ts">
import { faker } from '@faker-js/faker';
import { listToOptions } from '@milaboratories/helpers';
import type {
  Size } from '@platforma-sdk/ui-vue';
import {
  PlBlockPage,
  PlTextField,
  PlSlideModal,
  PlBtnPrimary,
  PlCheckbox,
  PlContainer,
  PlBtnSecondary,
  PlDropdown,
  PlDialogModal,
  PlRow,
  PlTooltip,
  PlBtnGhost,
  PlNumberField,
  PlBtnDanger,
  PlBtnGroup,
  PlAccordionSection,
} from '@platforma-sdk/ui-vue';
import { computed, reactive } from 'vue';

const dialogData = reactive({
  text: '',
  item: '',
  dialogModal: false,
  title: true,
  actions: true,
  actionsHasTopBorder: true,
  size: undefined as Size | undefined,
  dialogWidth: 448, // default,
  maxHeight: 440,
  contentHeight: 216,
  closeOnOutsideClick: true,
});

const slideData = reactive({
  text: '',
  item: '',
  slideModal: false,
  title: true,
  actions: true,
  shadow: false,
  closeOnOutsideClick: true,
  sliderWidth: '368px', // default and min
});

const modalVariants = ['newProject', 'newProject2', 'deleteDataset', 'deleteDataset2'] as const;

const examples = reactive({
  projectLabel: '',
  modal: '' as (typeof modalVariants)[number] | '',
});

const append = reactive<Record<string, boolean>>({});

for (const example of modalVariants) {
  append[example] = computed({
    get() {
      return example === examples.modal;
    },
    set(v) {
      examples.modal = v ? example : '';
    },
  }) as unknown as boolean;
}

const lorem = faker.lorem.paragraph(100);

const sizeOptions = [{
  label: 'Small',
  value: 'small',
}, {
  label: 'Medium',
  value: 'medium',
}, {
  label: 'Large',
  value: 'large',
}, {
  label: 'Unset',
  value: undefined,
}];
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <template #title>Modals</template>
    <PlRow>
      <PlContainer width="50%" @click.stop>
        <PlRow>
          <PlBtnPrimary @click.stop="dialogData.dialogModal = true">
            Open PlDialogModal
          </PlBtnPrimary>
        </PlRow>
        <PlDropdown v-model="dialogData.size" label="Size (Takes precedence over (min | max)(width | height) properties)" :options="sizeOptions" />
        <PlNumberField
          v-model="dialogData.dialogWidth"
          label="Dialog width in px (without gutters)"
        />
        <PlNumberField
          v-model="dialogData.contentHeight"
          label="Content height in px (without gutters)"
        />
        <PlNumberField
          v-model="dialogData.maxHeight"
          label="Max height in px (default is 'auto')"
        />
        <PlCheckbox v-model="dialogData.actionsHasTopBorder">
          Actions slot has top border
        </PlCheckbox>
        <PlCheckbox v-model="dialogData.title">Show title</PlCheckbox>
        <PlCheckbox v-model="dialogData.actions">Show actions</PlCheckbox>
        <PlCheckbox v-model="dialogData.closeOnOutsideClick">Close on outside click</PlCheckbox>
        <h4>Examples</h4>
        <PlBtnPrimary @click="examples.modal = 'newProject'">Example with one control</PlBtnPrimary>
        <PlBtnPrimary @click="examples.modal = 'newProject2'">
          Example with multiple controls
        </PlBtnPrimary>
        <PlBtnPrimary @click="examples.modal = 'deleteDataset'">
          Example with text message + description
        </PlBtnPrimary>
        <PlBtnPrimary @click="examples.modal = 'deleteDataset2'">
          Example with text message without description
        </PlBtnPrimary>
      </PlContainer>

      <PlContainer width="50%">
        <PlRow>
          <PlBtnPrimary @click.stop="slideData.slideModal = true">Open PlSlideModal</PlBtnPrimary>
        </PlRow>
        <PlCheckbox v-model="slideData.shadow">Show shadow</PlCheckbox>
        <PlCheckbox v-model="slideData.closeOnOutsideClick">Close on outside click</PlCheckbox>
        <PlCheckbox v-model="slideData.title">Show title</PlCheckbox>
        <PlCheckbox v-model="slideData.actions">Show actions</PlCheckbox>
      </PlContainer>
    </PlRow>

    <!--Dialog modal-->
    <PlDialogModal
      v-model="dialogData.dialogModal"
      :size="dialogData.size"
      :width="`${dialogData.dialogWidth}px`"
      :close-on-outside-click="dialogData.closeOnOutsideClick"
      :actions-has-top-border="dialogData.actionsHasTopBorder"
      :max-height="`${dialogData.maxHeight}px`"
    >
      <template v-if="dialogData.title" #title>My title</template>
      <div class="content-box" :style="{ minHeight: dialogData.contentHeight + 'px' }">
        <span>contentHeight: {{ dialogData.contentHeight }} px</span>
        <span>
          contentBoxHeight (+ 16 + 40): {{ Number(dialogData.contentHeight) + 16 + 40 }} px
        </span>
      </div>
      <template v-if="dialogData.actions" #actions>
        <PlBtnPrimary>Save</PlBtnPrimary>
        <PlBtnGhost :justify-center="false">Cancel</PlBtnGhost>
      </template>
    </PlDialogModal>

    <!--Examples-->
    <PlDialogModal
      v-model="append.newProject"
      :width="`${dialogData.dialogWidth}px`"
      :close-on-outside-click="dialogData.closeOnOutsideClick"
      :actions-has-top-border="dialogData.actionsHasTopBorder"
    >
      <template #title>New Project</template>
      <PlTextField v-model="examples.projectLabel" label="Project label" />
      <template v-if="dialogData.actions" #actions>
        <PlBtnPrimary>Create</PlBtnPrimary>
        <PlBtnGhost>Cancel</PlBtnGhost>
      </template>
    </PlDialogModal>

    <PlDialogModal
      v-model="append.newProject2"
      :width="`${dialogData.dialogWidth}px`"
      :close-on-outside-click="dialogData.closeOnOutsideClick"
      :actions-has-top-border="dialogData.actionsHasTopBorder"
    >
      <template #title>New Project</template>
      <PlTextField v-model="examples.projectLabel" label="Project label" />
      <PlTextField v-model="examples.projectLabel" label="Project label" />
      <PlTextField v-model="examples.projectLabel" label="Project label" />
      <template v-if="dialogData.actions" #actions>
        <PlBtnPrimary>Create</PlBtnPrimary>
        <PlBtnGhost>Cancel</PlBtnGhost>
      </template>
    </PlDialogModal>

    <PlDialogModal
      v-model="append.deleteDataset"
      :close-on-outside-click="dialogData.closeOnOutsideClick"
      no-top-content-gutter
    >
      <template #title>Are you sure you want to<br />delete this dataset? 🧐</template>
      This action cannot be undone
      <template #actions>
        <PlBtnDanger>Delete</PlBtnDanger>
        <PlBtnGhost>Cancel</PlBtnGhost>
      </template>
    </PlDialogModal>

    <PlDialogModal
      v-model="append.deleteDataset2"
      :close-on-outside-click="dialogData.closeOnOutsideClick"
      no-top-content-gutter
    >
      <template #title>Are you sure you want to<br />delete this dataset? 🧐</template>
      <template #actions>
        <PlBtnDanger>Delete</PlBtnDanger>
        <PlBtnGhost>Cancel</PlBtnGhost>
      </template>
    </PlDialogModal>

    <!--Slide Modal-->
    <PlSlideModal
      v-model="slideData.slideModal"
      :close-on-outside-click="slideData.closeOnOutsideClick"
      :shadow="slideData.shadow"
      :width="slideData.sliderWidth"
    >
      <template v-if="slideData.title" #title>Settings</template>
      <PlTextField v-model="slideData.text" label="Text field" />
      <PlDropdown
        v-model="dialogData.item"
        label="Select item"
        :options="listToOptions(['Item 1', 'Item 2', 'Item 3'])"
      />
      <PlDropdown
        v-model="dialogData.item"
        label="Select item"
        :options="listToOptions(['Item 1', 'Item 2', 'Item 3'])"
      />
      <PlBtnGroup
        v-model="dialogData.item"
        :options="listToOptions(['Item 1', 'Item 2', 'Item 3'])"
      />
      <PlDropdown
        v-model="dialogData.item"
        label="Select item"
        :options="listToOptions(['Item 1', 'Item 2', 'Item 3'])"
      />
      <PlCheckbox v-model="slideData.slideModal">Also closes the modal window</PlCheckbox>
      <PlCheckbox :model-value="true">
        Drop outliers
        <PlTooltip class="info" position="top">
          <template #tooltip>
            Drop samples which are below downsampling value as computed according to specified
            default downsampling option.
          </template>
        </PlTooltip>
      </PlCheckbox>
      <p>{{ lorem }}</p>
      <PlTextField v-model="slideData.sliderWidth" label="Slider width (css format: px, %)" />
      <PlDropdown
        v-model="dialogData.item"
        label="Select item"
        :options="listToOptions(['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5', 'Item 6'])"
      />
      <PlAccordionSection label="Section 1">
        <div>Section 1</div>
        <div>Section 1</div>
        <div>Section 1</div>
        <div>Section 1</div>
      </PlAccordionSection>
      <PlAccordionSection label="Section 2">
        <div>Section 3</div>
        <div>Section 2</div>
        <div>Section 2</div>
      </PlAccordionSection>
      <template v-if="slideData.actions" #actions>
        <PlBtnPrimary>Save</PlBtnPrimary>
        <PlBtnSecondary>Cancel</PlBtnSecondary>
      </template>
    </PlSlideModal>
  </PlBlockPage>
</template>

<style lang="css" scoped>
.content-box {
  background-color: #f7f8fa;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--ic-02);
  border-radius: 6px;
}
</style>
