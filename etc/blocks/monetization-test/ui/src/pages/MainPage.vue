<script setup lang="ts">
import type { ImportFileHandle } from '@platforma-sdk/model';
import type { ImportedFiles, ListOption } from '@platforma-sdk/ui-vue';

import { PlAlert, PlBlockPage, PlContainer, PlRow, PlTextField, PlBtnPrimary, PlFileDialog, PlFileInput, PlDropdownMulti } from '@platforma-sdk/ui-vue';
import { useApp } from '../app';
import { computed, reactive, ref } from 'vue';
import PlMonetizationDraft from '../components/PlMonetizationDraft.vue';
const app = useApp();

const dropdownOptions: ListOption<string>[] = [
  {
    text: 'sha256',
    value: 'sha256'
  },
  {
    text: 'lines (only in .zip files)',
    value: 'lines',
  },
  {
    text: 'size',
    value: 'size'
  }
];

const files = reactive<{
  isMultiDialogFileOpen: boolean;
}>({
  isMultiDialogFileOpen: false,
})

const updateHandle = (v: ImportFileHandle | undefined, i: number) => {
  if (v) {
    app.model.args.inputHandles[i].handle = v;
  } else {
    app.model.args.inputHandles.splice(i, 1);
  }
};

const onImport = (imported: ImportedFiles) => {
  app.model.args.inputHandles = imported.files.map((h, i) => ({
    handle: h,
    fileName: `test${i}.txt`,
    argName: `arg_${i}`,
    options: ['size', 'sha256']
  }));
};

const parsedToken = computed({
  get: () => {
    const splitted = app.model.outputs.token?.split('.') ?? [];
    const data = splitted[1];
    return JSON.parse(atob(data));
  },
  set: () => {}
})

const verificationResult = ref('');

const publicKey = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAECGShTw8Plag1uMuCg9OMYVHCF+wzjvXKr3cihyO77jEe9CrF6RP9tfnCd2XjM7XqQ0QH3i41rz5ohCB9fDDBbQ==';

async function verify(token: string) {
  const cryptoPublicKey = await crypto.subtle.importKey(
    'spki',
    Uint8Array.from(atob(publicKey), c => c.charCodeAt(0)).buffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['verify']
  );

  const [base64Header, base64Payload, signature] = token.split('.');
  if (!base64Header || typeof base64Payload !== 'string' || typeof signature !== 'string')
    throw new Error('Invalid token body');

  const signatureBinary = Uint8Array.from(
    atob(signature.replace(/-/g, '+').replace(/_/g, '/')),
    c => c.charCodeAt(0)
  );

  try {
    const result = await crypto.subtle.verify(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      cryptoPublicKey,
      signatureBinary,
      new TextEncoder().encode(`${base64Header}.${base64Payload}`)
    );

    if (result)
      verificationResult.value = "Signature is correct";
    else
      verificationResult.value = "Signature is incorrect";
  } catch (e: unknown) {
    verificationResult.value = "Verification failed";
  }
}


</script>

<template>
  <PlBlockPage>

    <PlTextField v-model="app.model.args.productKey"
      label="Enter product key (keep MIFAKEMIFAKEMIFAKE for fake product)" clearable />
      
    <PlTextField v-model="app.model.args.monetizationDate" label="Enter monetization date" />

    <PlContainer width="400px">
      <PlBtnPrimary @click="files.isMultiDialogFileOpen = true">
        Open multiple files to monetize
      </PlBtnPrimary>
    </PlContainer>
    <template v-for="({ handle }, i) of app.model.args.inputHandles" :key="i">
      <PlRow>
        <PlTextField v-model="app.model.args.inputHandles[i].fileName" label="Type file name" />
        <PlTextField v-model="app.model.args.inputHandles[i].argName" label="Type argument name" />
        <PlFileInput :model-value="handle"
          @update:model-value="(v: ImportFileHandle | undefined) => updateHandle(v, i)" />
        <PlDropdownMulti label="Metrics to monetize" v-model="app.model.args.inputHandles[i].options"
          :options="dropdownOptions" />
      </PlRow>
    </template>
    <PlFileDialog v-model="files.isMultiDialogFileOpen" multi @import:files="onImport" />

    <PlContainer />

    <PlMonetizationDraft :monetization-info="app.model.outputs.info" />

    <PlAlert label="token" v-if="app.model.outputs.token"> {{ app.model.outputs.token }}
    </PlAlert>

    <PlBtnPrimary v-if="app.model.outputs.token" @click="verify(app.model.outputs.token)">
      Verify</PlBtnPrimary>

    <PlAlert label="token verification" v-if="verificationResult"> {{ verificationResult }}
    </PlAlert>

    <PlAlert label="trying to parse a token" v-if="app.model.outputs.token">
      <pre> {{ JSON.stringify(parsedToken, null, 2) }} </pre>
    </PlAlert>

  </PlBlockPage>
</template>
