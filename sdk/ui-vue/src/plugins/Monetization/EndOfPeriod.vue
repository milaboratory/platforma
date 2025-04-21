<script setup lang="ts">
defineProps<{
  endOfPeriod: string | null;
}>();

const formateStringDate = (date: string | null) => {
  if (!date) return 'N/A';
  const dateObj = new Date(date);
  const day = dateObj.getDate().toString().padStart(2, '0');
  const month = (dateObj.getMonth() + 1).toString().padStart(2, '0'); // Month is 0-indexed
  const year = dateObj.getFullYear();
  return `${day}.${month}.${year}`;
};
</script>

<template>
  <div :class="$style.container">
    <span>End of period</span>
    <span>{{ formateStringDate(endOfPeriod) }}</span>
  </div>
</template>

<style module>
.container {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background-color: #F7F8FA;
  border-radius: 6px;
  min-height: 40px;
  padding: 0 12px 0 12px;
  color: var(--txt-01);
  font-size: 14px;
  font-weight: 500;
  border: 1px solid var(--border-color-div-grey);
  span:first-child {
    overflow: hidden;
    font-weight: 600;
  }
}
</style>
