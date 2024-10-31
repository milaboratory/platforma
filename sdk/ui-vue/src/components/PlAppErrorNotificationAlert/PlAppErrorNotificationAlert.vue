<script setup lang="ts">
import type { BlockOutputsBase } from '@platforma-sdk/model';
import type { OutputErrors } from '../../types';
import './PlAppErrorNotificationAlert.scss';
import { PlBtnPrimary, PlDialogModal, PlNotificationAlert, PlSpacer, PlCopyData } from '@milaboratories/uikit';
import { ref } from 'vue';

defineProps<{ errors: OutputErrors<BlockOutputsBase> }>();

const showErrorsDialog = ref(false);

function showErrors() {
  showErrorsDialog.value = true;
}

function copyData(data: OutputErrors<BlockOutputsBase>[string]) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(JSON.stringify(data));
  }
}
</script>
<template>
  <div class="pl-app-notification-alert">
    <PlDialogModal v-model="showErrorsDialog" width="50%" tyle="max-height: 100vh">
      <template #title> Errors </template>
      <div class="pl-app-notification-alert__content">
        <div v-for="(err, index) in errors" :key="index" class="pl-app-notification-alert__item">
          <div class="pl-app-notification-alert__title">{{ err?.name }}</div>
          <div class="pl-app-notification-alert__error-description">
            <code>
              {{ err?.message }}
              {{ err?.stack }}
            </code>
            <div class="pl-app-notification-alert__copy-container">
              <PlCopyData class="pl-app-notification-alert__copy-icon" @copy-data="copyData(err)" />
            </div>
          </div>
        </div>
      </div>
    </PlDialogModal>

    <PlNotificationAlert type="error" closable>
      Output failed. Review block logic and retry
      <template #actions>
        <PlSpacer />
        <PlBtnPrimary @click="showErrors">Show errors</PlBtnPrimary>
      </template>
    </PlNotificationAlert>
  </div>
</template>
