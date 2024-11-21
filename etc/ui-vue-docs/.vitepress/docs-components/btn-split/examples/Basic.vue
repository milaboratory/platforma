<script setup lang="ts">
import { PlBtnPrimary, PlBtnSplit, PlCheckbox, PlIcon24, PlMaskIcon24 } from '@milaboratories/uikit';
import { ref } from 'vue';

let options = Array(5).fill(0).map((v,i)=> ({label:`Item${i}`, value:`value-${i}`}));
let model = ref('value-1');
let undefinedModel = ref();
let loading = ref(false);

function clickHandler(){
    console.log('click');
}

</script>
<template>
    <div>
        <div style="background-color: red;">
            <div>
                <PlMaskIcon24 name="dna-import" style="background-color: green;"/>
            </div>

            <div>
                <PlIcon24 name="dna-import" />
                <PlIcon24 name="dna-import" />
                <PlIcon24 name="dna-import" />
                <PlIcon24 name="dna-import" />

            </div>
           
        </div>
        

        <div class="text-m-btn mb-2">Basic</div>
        <div class="text-s">Selected value  {{model}}</div>
        <PlBtnSplit v-model="model" :options="options" @click="clickHandler"/>
    </div>

    <div class="d-flex gap-16 justify-space-between">
        <PlBtnSplit v-model="model" :options="options" @click="clickHandler"/>
        <PlBtnSplit v-model="model" :options="options" @click="clickHandler"/>
        <PlBtnSplit v-model="model" :options="options" @click="clickHandler"/>
    </div>

    <div>
        <div class="text-m-btn mb-2 d-flex gap-15">Loading by props <PlCheckbox v-model="loading">Loading</PlCheckbox> </div>
        <PlBtnSplit v-model="model" :options="options" :loading="loading" @click="clickHandler"/>
    </div>

    <div>
        <div class="text-m-btn mb-2">Undefined options trigger loading status</div>
        <PlBtnSplit v-model="model" @click="clickHandler"/>
    </div>

    <div>
        <div class="text-m-btn mb-2">Disabled</div>
        <PlBtnSplit v-model="model" :options="options" disabled @click="clickHandler"/>
    </div>

    <div>
        <div class="text-m-btn mb-2">Empty model</div>
        <PlBtnSplit v-model="undefinedModel" :options="options" @click="clickHandler"/>
    </div>
</template>