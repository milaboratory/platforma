<script setup lang="ts">
import { PlSidebar, PlSidebarItem } from '../PlSidebar';

const opened = defineModel<boolean>('opened');

</script>

<template>
  <PlSidebar v-model:opened="opened" :class="$style.root" :closable="true">
    <template #item-0>
      <PlSidebarItem>
        <template #header-content>
          My Scheme
        </template>
      </PlSidebarItem>
    </template>
    <template #body-content>
      Cannot find annotations for this scheme.
    </template>
    <template #item-1>
      <PlSidebarItem>
        <template #body-content>
          <div>Body content goes here</div>
        </template>
      </PlSidebarItem>
    </template>
  </PlSidebar>
</template>

<style module>
.root {

}
</style>
