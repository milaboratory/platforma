import { useIntervalFn } from "@vueuse/core";
import * as v from "valibot";
import { computed, ref, watch } from "vue";
import { useSdkPlugin } from "../../defineApp";
import { Response } from "./validation";

export function useInfo() {
  const sdk = useSdkPlugin();

  const app = computed(() => (sdk.loaded ? sdk.useApp() : undefined));

  // TODO use a separate plugin state when it's implemented
  const getModelArgsOrState = (model: Record<string, unknown> | undefined) => {
    if (!model) return {};
    if ("data" in model) {
      return model.data as Record<string, unknown>;
    } else if ("args" in model) {
      return model.args as Record<string, unknown>;
    }
    return {};
  };

  const inputData = computed(() => getModelArgsOrState(app.value?.model));

  const hasMonetization = computed(() => {
    return inputData.value && "__mnzDate" in inputData.value;
  });

  const parsed = computed(() => v.safeParse(Response, app.value?.model.outputs["__mnzInfo"]));

  const currentInfo = computed(() => (parsed.value.success ? parsed.value.output : undefined));

  const error = computed(() =>
    parsed.value.success ? info.value?.response?.error : v.summarize(parsed.value.issues),
  );

  const info = ref<Response | undefined>(undefined);

  const isLoading = ref(false);

  const version = ref(0);

  watch(
    [currentInfo],
    ([nextInfo]) => {
      if (nextInfo) {
        info.value = nextInfo;
        const currentVersion = ++version.value;
        setTimeout(() => {
          if (version.value === currentVersion) {
            isLoading.value = false;
          }
        }, 1000);
      }
    },
    { immediate: true },
  );

  const result = computed(() => info.value?.response?.result);

  const canRun = computed(() => !!result.value?.canRun);

  const status = computed(() => (currentInfo.value ? result.value?.status : ""));

  const customerEmail = computed(() => result.value?.customerEmail);

  const endOfBillingPeriod = computed(() => result.value?.mnz.endOfBillingPeriod);

  const limits = computed(() => result.value?.mnz.limits);

  const refresh = () => {
    isLoading.value = true;
    inputData.value["__mnzDate"] = new Date().toISOString();
  };

  watch(canRun, (canRunValue) => {
    if (hasMonetization.value) {
      (inputData.value as Record<string, unknown>)["__mnzCanRun"] = canRunValue;
    }
  });

  if (hasMonetization.value) {
    useIntervalFn(refresh, 60_000); // 1 minute
  }

  return {
    hasMonetization,
    result,
    error,
    canRun,
    status,
    customerEmail,
    endOfBillingPeriod,
    limits,
    refresh,
    version,
    isLoading,
  };
}
