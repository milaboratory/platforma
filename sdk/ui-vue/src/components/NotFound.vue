<script lang="ts" setup>
import { PlBtnSecondary } from "@milaboratories/uikit";
import { useSdkPlugin } from "../defineApp";

const sdk = useSdkPlugin();

const app = sdk.useApp();

const goToMain = () => {
  app.navigateTo("/");
};
</script>

<template>
  <div data-testid="pl-not-found" class="block__not-found">
    <h1 data-testid="pl-not-found-title">
      Not found route: {{ app.snapshot.navigationState.href }}
    </h1>
    <PlBtnSecondary data-testid="pl-not-found-return" @click.stop="goToMain"
      >Return to main page</PlBtnSecondary
    >
  </div>
</template>
