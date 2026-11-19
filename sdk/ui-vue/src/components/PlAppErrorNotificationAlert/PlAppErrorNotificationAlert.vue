<script setup lang="ts">
import type { BlockOutputsBase } from "@platforma-sdk/model";
import type { OutputErrors } from "../../types";
// @TODO module
import "./pl-app-error-notification-alert.scss";
import {
  PlBtnPrimary,
  PlDialogModal,
  PlNotificationAlert,
  PlSpacer,
  PlLogView,
} from "@milaboratories/uikit";
import { computed, ref, watch } from "vue";

export type FullMessage = { fullMessage: string };

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
  <div data-testid="pl-app-error-notification-alert" class="pl-app-notification-alert">
    <PlDialogModal
      v-model="isModalOpen"
      data-testid="pl-app-error-notification-alert-modal"
      width="720px"
      style="max-height: 100vh"
    >
      <template #title> Errors </template>
      <div
        data-testid="pl-app-error-notification-alert-content"
        class="pl-app-notification-alert__content"
      >
        <template v-for="item in existingErrors" :key="item[0]">
          <div
            data-testid="pl-app-error-notification-alert-item"
            class="pl-app-notification-alert__item"
          >
            <div
              data-testid="pl-app-error-notification-alert-item-title"
              class="pl-app-notification-alert__title"
            >
              Block output: {{ item[0] }}
            </div>
            <PlLogView
              data-testid="pl-app-error-notification-alert-log"
              :value="item[1]?.message"
              :valueToCopy="
                'fullMessage' in (item[1] ?? {})
                  ? (item[1] as unknown as FullMessage).fullMessage
                  : item[1]?.message
              "
              :download-filename="`output-${item[0]}-error.txt`"
            />
          </div>
        </template>
      </div>
    </PlDialogModal>

    <PlNotificationAlert
      v-model="isAlertOpen"
      data-testid="pl-app-error-notification-alert-message"
      type="error"
      closable
    >
      Some outputs have errors.
      <template #actions>
        <PlBtnPrimary
          data-testid="pl-app-error-notification-alert-show-errors"
          icon="arrow-right"
          @click="showErrors"
          >See errors</PlBtnPrimary
        >
        <PlSpacer />
      </template>
    </PlNotificationAlert>
  </div>
</template>
