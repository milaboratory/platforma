<script lang="ts" setup>
import { PlSearchField } from "@milaboratories/uikit";

const model = defineModel<string>({ required: true });
</script>

<template>
  <PlSearchField v-model="model" clearable placeholder="Search...">
    <template #helper>
      <b>How table search works:</b>
      <br />
      <ul>
        <li>
          <b>Exact match only.</b><br />
          No partials, wildcards, ranges, or regex.
        </li>
        <li>
          <b>Scope:</b> Searches all visible columns. To include a column, make it visible in
          Columns.
        </li>
        <li>
          <b>Text columns:</b> Exact string equality. Characters must match exactly (including case,
          spaces, and punctuation).
        </li>
        <li>
          <b>Number columns:</b> Exact numeric equality. 71 matches 71 and 71.0; it does not match
          715 or 0.71/0.85.
        </li>
      </ul>
      <b>Examples:</b>
      <br />
      <ul>
        <li>CASSLDRGTEAFF → shows rows where any visible column equals that full string.</li>
        <li>85 → matches 85 / 85.0, not 0.85 or 850.</li>
      </ul>
    </template>
  </PlSearchField>
</template>
