<script lang="ts" setup>
import {
  Basic, BasicRaw, TitleAndDescription, TitleAndDescriptionRaw, PlDropdownUndefinedOptions,
  PlDropdownUndefinedOptionsRaw,
} from './examples';
import CodeExample from '@app-components/CodeExample.vue';
import ComponentProps from '@app-components/ComponentProps.vue';
import AppCodeBlock from '@app-components/AppCodeBlock.vue';
import componentProps from './props';
import AppDocCodeContainer from '@app-components/AppDocCodeContainer.vue';
</script>

<template>
  <AppDocCodeContainer>
    <AppCodeBlock>
      <template #description/>
      <CodeExample :code="BasicRaw">
        <template #name>Basic usage</template>
        <Basic />
      </CodeExample>
    </AppCodeBlock>

    <ComponentProps :data="componentProps" />

    <AppCodeBlock>
      <CodeExample :code="PlDropdownUndefinedOptionsRaw">
        <template #name>Loading</template>
        <PlDropdownUndefinedOptions />
      </CodeExample>
    </AppCodeBlock>

    <AppCodeBlock>
      <template #description-header>Display option</template>
      <template #description>
        The PlDropdown component can display both a title and a description for each option.
      </template>
      <CodeExample :code="TitleAndDescriptionRaw">
        <template #name>Title and Description</template>
        <TitleAndDescription />
      </CodeExample>
    </AppCodeBlock>
  </AppDocCodeContainer>
</template>
