<script setup lang="ts">
import { z } from 'zod';
import { computed, ref, useCssModule, watch } from 'vue';
import { PlIcon24, useInterval, PlAlert } from '@platforma-sdk/ui-vue';
import { useApp} from '../app';

const style = useCssModule();

const MonetizationFree = z.literal('free');
const MonetizationSinglePayment = z.literal('single_payment');
const MonetizationSubscription = z.literal('subscription');

const MonetizationType = z.union([
  MonetizationFree,
  MonetizationSinglePayment,
  MonetizationSubscription,
]);

const DryRunResult = z.object({
  productKey: z.string(),
  productName: z.string(),
  canRun: z.boolean(),
  status: z.union([
    z.literal('select-tariff'),
    z.literal('active'),
    z.literal('payment_required'),
  ]),
  mnz: z.object({
    type: MonetizationType,
    details: z.object({
      spentRuns: z.number(),
      runsToSpend: z.number(),
      willRemainAfterRun: z.number().nullable(),
      subscription: z.unknown(),
    }),
  }),
}, { message: 'Invalid CreateProductStatResult' });

type DryRunResult = z.infer<typeof DryRunResult>;

const Response = z.object({
  httpError: z.string().optional(),
  response: z.object({
    result: DryRunResult.optional(),
    error: z.unknown().optional(),
  }).optional(),
}).optional();

type Response = z.infer<typeof Response>;

const app = useApp();

const mnzInfo = computed<unknown>(() => Response.safeParse(app.model.outputs['__mnzInfo']));

const currentInfo = computed<Response | undefined>(() => Response.safeParse(app.model.outputs['__mnzInfo']).data);

const info = ref<Response | undefined>(undefined);

watch([currentInfo], ([i]) => {
  if (i) {
    info.value = i;
  }
}, { immediate: true });

const result = computed(() => info.value?.response?.result);

const canRun = computed(() => !!result.value?.canRun);

watch(canRun, (v) => {
  if (v) {
    app.model.args['__mnzCanRun'] = v;
  }
});

const userCabinetUrl = computed(() => {
  if (!result.value) return undefined;
  
  return `https://scientist.platforma.bio/product/${result.value.productKey}`;
});

const copiedMessage = ref('');

const copyToClipboard = () => {
  if (userCabinetUrl.value) {
    navigator.clipboard.writeText(userCabinetUrl.value)
      .then(() => {
        copiedMessage.value = 'URL copied!';
        setTimeout(() => {
          copiedMessage.value = '';
        }, 2000);
      })
      .catch(err => {
        console.error('Failed to copy text: ', err);
        copiedMessage.value = 'Copy failed';
        setTimeout(() => {
          copiedMessage.value = '';
        }, 2000);
      });
  }
};

const getStatusColor = computed(() => {
  if (!result.value) return '';
  
  switch (result.value.status) {
    case 'active': return style.statusActive;
    case 'select-tariff': return style.statusSelectTariff;
    case 'payment_required': return style.statusPaymentRequired;
    default: return '';
  }
});

useInterval(() => {
  app.model.args.__mnzDate = new Date().toISOString();
}, 10_000);
</script>

<template>
  <div :class="$style.mnzContainer">
    <PlIcon24 :class="$style.info" name="info" :title="JSON.stringify(result, undefined, 2)" />
    <em>{{ app.model.args.__mnzDate }}</em>

    <PlAlert v-if="info?.response?.error" type="error" >
      {{ info.response.error }}
    </PlAlert>
    
    <div :class="$style.header">
      <div :class="[$style.statusIndicator, getStatusColor]"></div>
      <h3 :class="$style.title">{{ result?.productName }}</h3>
    </div>
    
    <div :class="$style.statusMessage" v-if="result?.status === 'select-tariff'">
      <PlIcon24 name="warning" :class="$style.warningIcon" />
      <span>Please select a tariff to continue</span>
    </div>
    
    <div :class="$style.statusMessage" v-if="result?.status === 'payment_required'">
      <PlIcon24 name="warning" :class="$style.warningIcon" />
      <span>Payment required to continue</span>
    </div>
    
    <div :class="$style.statusMessage" v-if="result?.canRun">
      <PlIcon24 name="checkmark" :class="$style.successIcon" />
      <span>Run is allowed</span>
    </div>
    <div :class="$style.statusMessage" v-else-if="result?.canRun === false">
      <PlIcon24 name="warning" :class="$style.warningIcon" />
      <span>Run is not allowed</span>
    </div>
    
    <div v-if="userCabinetUrl" :class="$style.urlSection">
      <div :class="$style.urlLabel">User cabinet URL:</div>
      <div :class="$style.urlActions">
        <div :class="$style.urlDisplay" :title="userCabinetUrl">{{ userCabinetUrl }}</div>
        <button :class="$style.copyButton" @click="copyToClipboard">
          <PlIcon24 name="copy" />
          <span>Copy</span>
        </button>
        <span v-if="copiedMessage" :class="$style.copiedMessage">{{ copiedMessage }}</span>
      </div>
    </div>
    
    <div v-if="result" :class="$style.details">
      <h4 :class="$style.detailsTitle">Run Details</h4>
      <div :class="$style.detailsGrid">
        <div :class="$style.detailItem">
          <div :class="$style.detailLabel">Spent runs:</div>
          <div :class="$style.detailValue">{{ result.mnz.details?.spentRuns }}</div>
        </div>
        <div :class="$style.detailItem">
          <div :class="$style.detailLabel">Runs to spend:</div>
          <div :class="$style.detailValue">{{ result.mnz.details?.runsToSpend }}</div>
        </div>
        <div :class="$style.detailItem">
          <div :class="$style.detailLabel">Will remain after run:</div>
          <div :class="$style.detailValue">{{ result.mnz.details?.willRemainAfterRun  === null ? 'Unlimited' : result.mnz.details?.willRemainAfterRun }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style module>
.mnzContainer {
  display: flex;
  flex-direction: column;
  gap: 16px;
  border: 1px solid #e0e0e0;
  padding: 20px;
  border-radius: 8px;
  position: relative;
  background-color: #fafafa;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  max-width: 600px;
}

.info {
  position: absolute;
  top: 10px;
  right: 10px;
  color: #666;
  cursor: pointer;
}

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