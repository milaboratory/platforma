<script setup lang="ts">
import { ref } from 'vue';
import { PlIcon24 } from '@milaboratories/uikit';

const props = defineProps<{
  userCabinetUrl: string;
}>();

const copiedMessage = ref('');

const copyToClipboard = () => {
  if (props.userCabinetUrl) {
    navigator.clipboard.writeText(props.userCabinetUrl)
      .then(() => {
        copiedMessage.value = 'URL copied!';
        setTimeout(() => {
          copiedMessage.value = '';
        }, 2000);
      })
      .catch((err) => {
        console.error('Failed to copy text: ', err);
        copiedMessage.value = 'Copy failed';
        setTimeout(() => {
          copiedMessage.value = '';
        }, 2000);
      });
  }
};
</script>

<template>
  <div v-if="userCabinetUrl" :class="$style.urlSection">
    <div :class="$style.urlLabel">Scientist cabinet URL:</div>
    <div :class="$style.urlActions">
      <div :class="$style.urlDisplay" :title="userCabinetUrl">{{ userCabinetUrl }}</div>
      <button :class="$style.copyButton" @click="copyToClipboard">
        <PlIcon24 name="copy" />
        <span>Copy</span>
      </button>
      <span v-if="copiedMessage" :class="$style.copiedMessage">{{ copiedMessage }}</span>
    </div>
  </div>
</template>

<style module>
.header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
}

.statusIndicator {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: #ccc;
}

.statusActive {
  background-color: #4caf50;
}

.statusSelectTariff {
  background-color: #ff9800;
}

.statusPaymentRequired {
  background-color: #f44336;
}

.title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.statusMessage {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 6px;
  background-color: #f5f5f5;
  border-left: 4px solid #ccc;
}

.warningIcon {
  color: #ff9800;
}

.successIcon {
  color: #4caf50;
}

.urlSection {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background-color: #f0f0f0;
  border-radius: 6px;
}

.urlLabel {
  font-weight: 500;
  color: #555;
}

.urlActions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.urlDisplay {
  font-family: monospace;
  font-size: 14px;
  color: #0066cc;
  background-color: #e6e6e6;
  padding: 6px 10px;
  border-radius: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 300px;
}

.copyButton {
  display: flex;
  align-items: center;
  gap: 6px;
  background-color: #2196f3;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s;
}

.copyButton:hover {
  background-color: #0b7dda;
}

.copyButton:active {
  background-color: #0a6bbd;
}

.copiedMessage {
  color: #4caf50;
  font-size: 14px;
  font-weight: 500;
}

.details {
  margin-top: 10px;
  padding: 16px;
  background-color: #f5f5f5;
  border-radius: 6px;
}

.detailsTitle {
  margin: 0 0 12px 0;
  font-size: 16px;
  font-weight: 500;
  color: #444;
}

.detailsGrid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
}

.detailItem {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detailLabel {
  font-size: 14px;
  color: #666;
}

.detailValue {
  font-size: 16px;
  font-weight: 500;
  color: #333;
}
</style>
