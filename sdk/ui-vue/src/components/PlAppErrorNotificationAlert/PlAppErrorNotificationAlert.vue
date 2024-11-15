<script setup lang="ts">
import type { BlockOutputsBase } from '@platforma-sdk/model';
import type { OutputErrors } from '../../types';
// @TODO module
import './pl-app-error-notification-alert.scss';
import { PlBtnPrimary, PlDialogModal, PlNotificationAlert, PlSpacer, PlCopyData } from '@milaboratories/uikit';
import { ref, watch } from 'vue';

const props = defineProps<{ errors: OutputErrors<BlockOutputsBase> }>();

const isModalOpen = ref(false);

const isAlertOpen = ref(true);

function showErrors() {
  isModalOpen.value = true;
}

function copyData(data: OutputErrors<BlockOutputsBase>[string]) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(JSON.stringify(data));
  }
}

function hasErrors(key: keyof OutputErrors<BlockOutputsBase>) {
  if (props.errors[key]) {
    return Object.keys(props.errors[key]).length > 0;
  }
  return false;
}

// @TODO (temp)
watch(
  () => props.errors,
  (errors) => {
    isAlertOpen.value = Object.values(errors).some((v) => !!v);
  },
  { immediate: true, deep: true },
);
</script>
<template>
  <div class="pl-app-notification-alert">
    <PlDialogModal v-model="isModalOpen" width="50%" style="max-height: 100vh">
      <template #title> Errors </template>
      <div class="pl-app-notification-alert__content">
        <template v-for="(err, name) in errors" :key="name">
          <div v-if="hasErrors(name)" class="pl-app-notification-alert__item">
            <div class="pl-app-notification-alert__title">{{ name }}</div>
            <div class="pl-app-notification-alert__error-description">
              <code>
                {{ err?.message }}
              </code>
              <PlCopyData class="pl-app-notification-alert__copy-icon" @copy-data="copyData(err)" />
            </div>
          </div>
        </template>
      </div>
    </PlDialogModal>

    <PlNotificationAlert v-model="isAlertOpen" type="error" closable>
      Some outputs have errors.
      <template #actions>
        <PlBtnPrimary icon="arrow-right" @click="showErrors">See errors</PlBtnPrimary>
        <PlSpacer />
      </template>
    </PlNotificationAlert>
  </div>
</template>
