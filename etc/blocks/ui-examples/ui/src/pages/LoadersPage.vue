<script lang="ts" setup>
import { PlProgressCell } from '@platforma-sdk/ui-vue';
import { ref } from 'vue';

const progress = ref(0);

setInterval(() => {
  if (progress.value >= 100) {
    progress.value = 0;
  }
  progress.value += 1;
}, 150);
</script>
<template>
  <div class="d-flex  p-20 gap-14">
    <div class="d-flex flex-column p-20 gap-14 flex-grow-1">
      <div class="text-m">Stage "not_started" no progress</div>
      <div class="test-cell-container" >
        <PlProgressCell stage="not_started" step="Step 1" progressString="not_started"/>
      </div>

      <div class="text-m">Stage "running" progress undefined</div>
      <div class="test-cell-container" >
        <PlProgressCell stage="running" step="Step 1" progressString="running"/>
      </div>

      <div class="text-m">Stage "done" no progress</div>
      <div class="test-cell-container" >
        <PlProgressCell stage="done" step="Step 1" progressString="done"/>
      </div>

      <div class="text-m">Stage "not_started" progress set 25%</div>
      <div class="test-cell-container" >
        <PlProgressCell :progress="25" stage="not_started" :step="`Step 1`" :progressString="`25/100`"/>
      </div>

      <div class="text-m">Stage "running" progress set 25%</div>
      <div class="test-cell-container" >
        <PlProgressCell :progress="25" stage="running" :step="`Step 1`" :progressString="`25/100`"/>
      </div>

      <div class="text-m">Stage "done" progress set 25%</div>
      <div class="test-cell-container" >
        <PlProgressCell :progress="25" stage="done" :step="`Step 1`" :progressString="`25/100`"/>
      </div>
    </div>

    <div class="d-flex flex-column p-20 gap-14 flex-grow-1">
      <div class="text-m">In progress 25%</div>
      <div class="test-cell-container" >
        <PlProgressCell :progress="25" stage="running" step="Step 1" progressString="0:12:34"/>
      </div>

      <div class="text-m">Long description</div>
      <div class="test-cell-container" >
        <PlProgressCell :progress="100" stage="running" step="Long description text overflow lorem ipsum color Long description text overflow lorem ipsum color" progressString="0:12:34"/>
      </div>

      <div class="text-m">Completed with :progress="100"</div>
      <div class="test-cell-container" >
        <PlProgressCell :progress="100" stage="done" step="Step 1" progressString="2/4"/>
      </div>

      <div class="text-m">Error</div>
      <div class="test-cell-container" >
        <PlProgressCell error="Some error description" :progress="100" stage="done" step="Step 1" progressString="2/4"/>
      </div>
    </div>
  </div>
</template>

<style>
.test-cell-container{
    width: 300px;
    height: 50px;
    border: 1px solid gray;
    padding: 0;
    border-radius: 1px;
}
</style>
