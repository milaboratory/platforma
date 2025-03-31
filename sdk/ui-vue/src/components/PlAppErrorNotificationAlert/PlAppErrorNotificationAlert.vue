<script setup lang="ts">
import type { BlockOutputsBase } from '@platforma-sdk/model';
import type { OutputErrors } from '../../types';
// @TODO module
import './pl-app-error-notification-alert.scss';
import { PlBtnPrimary, PlDialogModal, PlNotificationAlert, PlSpacer, PlLogView } from '@milaboratories/uikit';
import { computed, ref, watch } from 'vue';

const props = defineProps<{ errors: OutputErrors<BlockOutputsBase> }>();

const isModalOpen = ref(false);

const isAlertOpen = ref(true);

const existingErrors = computed(() => Object.entries(props.errors).filter((item) => !!item[1]));

function showErrors() {
  isModalOpen.value = true;
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
    <PlDialogModal v-model="isModalOpen" width="720px" style="max-height: 100vh">
      <template #title> Errors </template>
      <div class="pl-app-notification-alert__content">
        <template v-for="item in existingErrors" :key="item[0]">
          <div class="pl-app-notification-alert__item">
            <div class="pl-app-notification-alert__title">Block output: {{ item[0] }}</div>
            <PlLogView :value="item[1]?.message" />
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
