<script setup lang="ts">
import { ref, computed } from 'vue';
import { PlSlideModal, PlBtnGhost, PlDropdown, PlAlert, PlIcon24, PlBtnSecondary } from '@milaboratories/uikit';
import { useButtonTarget } from './useButtonTarget';
import { useInfo } from './useInfo';
import UserCabinetCard from './UserCabinetCard.vue';
import RunStatus from './RunStatus.vue';
import LimitCard from './LimitCard.vue';
import EndOfPeriod from './EndOfPeriod.vue';

const isOpen = ref(false);

const {
  result,
  error,
  hasMonetization,
  canRun,
  status,
  customerEmail,
  endOfBillingPeriod,
  limits,
  refresh,
  isLoading,
} = useInfo();

const teleportTarget = useButtonTarget(hasMonetization);

const productName = computed(() => result.value?.productName);

const userCabinetUrl = computed(() => {
  if (!result.value) return undefined;

  const u = new URL(`https://scientist.platforma.bio/product/${result.value.productKey}`);

  if (customerEmail.value) {
    u.searchParams.set('email', customerEmail.value);
  }

  return u.toString();
});

const options = computed(() => {
  if (!result.value) return [];

  return [
    {
      label: result.value.productName,
      value: result.value.productName,
    },
  ];
});

const statusText = computed(() => {
  switch (status.value) {
    case 'active':
      return '';
    case 'limits_exceeded':
      return 'Usage limits exceeded for the current billing period.';
    case 'payment_required':
      return 'Payment required to continue using the service.';
    case 'select-tariff':
      return 'Select a subscription plan in the Scientist Cabinet.';
    case 'inactive':
      return 'Not found billing period.';
    case 'awaiting':
      return 'Waiting for monetization information';
    default:
      return 'Unknown status: ' + status.value;
  }
});

const btnIcon = computed(() => {
  if (canRun.value) return 'monetization-on';
  return 'monetization-off';
});
</script>

<template>
  <PlSlideModal v-if="hasMonetization" v-model="isOpen">
    <template #title>
      <div class="flex items-center gap-2">
        <span>Subscription</span>
      </div>
    </template>
    <PlDropdown label="Product" readonly :model-value="productName" :options="options" />
    <RunStatus :can-run="canRun" :status-text="statusText">
      <PlBtnSecondary
        title="Refresh status"
        round
        size="small"
        style="margin-left: auto;"
        icon="loading"
        :loading="isLoading"
        @click="refresh"
      />
    </RunStatus>
    <PlAlert v-if="error" type="error">
      {{ error }}
    </PlAlert>
    <UserCabinetCard v-if="userCabinetUrl" :user-cabinet-url="userCabinetUrl" />
    <EndOfPeriod v-if="endOfBillingPeriod" :end-of-period="endOfBillingPeriod" />
    <template v-if="limits">
      <LimitCard
        v-for="limit in limits"
        :key="limit.type"
        :type="limit.type"
        :label="limit.type"
        :used="limit.used"
        :to-spend="limit.toSpend"
        :available="limit.available"
      />
    </template>
  </PlSlideModal>
  <!-- Teleport to the title slot -->
  <Teleport v-if="hasMonetization && teleportTarget" :to="teleportTarget">
    <PlBtnGhost @click.stop="isOpen = true">
      Subscription
      <template #append>
        <PlIcon24 :name="btnIcon" />
      </template>
    </PlBtnGhost>
  </Teleport>
</template>
