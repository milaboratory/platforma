<script setup lang="ts">
import { reactive } from 'vue';
import Layout from '@/Layout.vue';
import Split from '@/Split.vue';
import { PlNumberField } from '@milaboratories/uikit';

const models = reactive({
  model0: 0,
  model1: undefined,
  model2: NaN,
  model3: '23a' as unknown as number, // to cause runtime error
  model4: '100' as unknown as number, // to cause runtime error
  model5: 8768769869.878687687
});
</script>
<template>
  <Layout>
    <Split name="Number field">
      <div class="container">
        <div class="container">
          <div class="text-h3 h3">Model values</div>
          <div>{{ models }}</div>
        </div>
        <div class="container">
          <div class="text-h3 h3">Model</div>
          <PlNumberField v-model="models.model0" label="Your label" placeholder="Some placeholder" />
        </div>

        <div class="container">
          <div class="text-h3 h3">Disabled</div>
          <PlNumberField v-model="models.model0" :disabled="true" label="Your label" placeholder="Some placeholder" />
        </div>

        <div class="container">
          <div class="text-h3 h3">Model undefined and MAX is set to 7</div>
          <PlNumberField v-model="models.model1" :max-value="7" label="Your label" placeholder="Some placeholder" />
          <div class="text-h3 h3">Model undefined and MIN is set to 3</div>
          <PlNumberField v-model="models.model1" :min-value="3" label="Your label" placeholder="Some placeholder" />
        </div>

        <div class="container">
          <div class="text-h3 h3">Min and max</div>
          <PlNumberField v-model="models.model0" :max-value="7" :min-value="3" label="Your label max - 7 min - 3" placeholder="Some placeholder" />
        </div>

        <div class="container">
          <div class="text-h3 h3">Model NaN</div>
          <PlNumberField v-model="models.model2" label="Your label" placeholder="Some placeholder" />
          <div class="text-h3 h3">Model NaN MIN and MAX</div>
          <PlNumberField v-model="models.model2" :max-value="10" :min-value="-10" label="Your label" placeholder="Some placeholder" />
        </div>

        <div class="container">
          <div class="text-h3 h3">String model not number</div>
          <PlNumberField v-model="models.model3" label="Your label" placeholder="Some placeholder" />
        </div>

        <div class="container">
          <div class="text-h3 h3">String model is number</div>
          <PlNumberField v-model="models.model4" label="Your label" placeholder="Some placeholder" />
        </div>

        <div class="container" style="width: 150px;">
          <div class="text-h3 h3">Long number in a short field</div>
          <PlNumberField v-model="models.model4" label="Your label" placeholder="Some placeholder" />
        </div>
        <div class="container">
          <div class="text-h3 h3">No arrow buttons</div>
          <PlNumberField v-model="models.model5" label="Your label" :useIncrementButtons=false placeholder="Some placeholder" />
        </div>
      </div>
    </Split>
  </Layout>
</template>

<style lang="scss">
.h3 {
  margin: 0;
  margin-bottom: 16px;
  font-size: 24px;
  line-height: 24px;
}

.container {
  border-radius: 6px;
  border: 1px solid var(--color-div-grey);
  padding: 16px;
  margin-bottom: 16px;
}
</style>
