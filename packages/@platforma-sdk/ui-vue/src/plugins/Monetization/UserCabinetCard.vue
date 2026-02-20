<script setup lang="ts">
import { ref, computed } from "vue";
import { PlTooltip, PlMaskIcon24 } from "@milaboratories/uikit";

const props = defineProps<{
  userCabinetUrl: string;
  email?: string;
}>();

const copiedMessage = ref("");

const iconName = computed(() => (copiedMessage.value ? "clipboard-copied" : "clipboard"));

const copyToClipboard = () => {
  if (props.userCabinetUrl) {
    navigator.clipboard
      .writeText(props.userCabinetUrl)
      .then(() => {
        copiedMessage.value = "URL copied!";
        setTimeout(() => {
          copiedMessage.value = "";
        }, 2000);
      })
      .catch((err) => {
        console.error("Failed to copy text: ", err);
        copiedMessage.value = "Copy failed";
        setTimeout(() => {
          copiedMessage.value = "";
        }, 2000);
      });
  }
};
</script>

<template>
  <div>
    <div v-if="userCabinetUrl" :class="$style.urlSection">
      <div :class="$style.urlLabel">Scientist cabinet URL:</div>
      <div :class="$style.urlActions">
        <div :class="$style.urlDisplay" :title="userCabinetUrl">{{ userCabinetUrl }}</div>
        <PlTooltip :close-delay="800" position="top">
          <PlMaskIcon24
            :class="$style.copyIcon"
            title="Copy content"
            :name="iconName"
            @click="copyToClipboard"
          />
          <template #tooltip>{{ copiedMessage ? copiedMessage : "Copy" }}</template>
        </PlTooltip>
      </div>
      <div v-if="email" :class="$style.email">
        <span>License owner:</span>
        <span>{{ email }}</span>
      </div>
    </div>
    <div :class="$style.hint">* Copy and paste the link into your browser</div>
  </div>
</template>

<style module>
.hint {
  margin-top: 6px;
  color: var(--txt-03);
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
}

.email {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--txt-03);

  > span:last-child {
    max-width: 200px;
    text-overflow: ellipsis;
    display: block;
    white-space: nowrap;
    overflow: hidden;
  }
}

.copyIcon {
  cursor: pointer;
}

.urlSection {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background-color: #f7f8fa;
  border-radius: 6px;
  border: 1px solid #e1e3eb;
}

.urlLabel {
  font-weight: 500;
  color: #555;
}

.urlActions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: nowrap;
}

.urlDisplay {
  font-family: monospace;
  font-size: 14px;
  color: #0066cc;
  padding: 6px 10px 6px 0;
  border-radius: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 300px;
}
</style>
