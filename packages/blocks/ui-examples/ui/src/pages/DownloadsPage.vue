<script setup lang="ts">
import { PlAlert, PlBlockPage, PlBtnPrimary, PlRow, downloadContent } from "@platforma-sdk/ui-vue";
import { useApp } from "../app";

const app = useApp();

// Example usage functions
const downloadExampleFiles = {
  downloadJSON: () => {
    const data = {
      message: "Hello World",
      timestamp: new Date().toISOString(),
      numbers: app.model.args.numbers,
    };
    downloadContent([JSON.stringify(data, null, 2), "application/json"], "example-data.json");
  },

  downloadCSV: () => {
    const csvContent = `Name,Value,Timestamp\nExample,${app.model.args.numbers.join(";")},${new Date().toISOString()}`;
    downloadContent([csvContent, "text/csv"], "example-data.csv");
  },

  downloadText: () => {
    const textContent = `Current numbers: ${app.model.args.numbers.join(", ")}\nGenerated at: ${new Date().toLocaleString()}`;
    downloadContent([textContent, "text/plain"], "example-report.txt");
  },

  // New examples for binary data
  downloadBinaryData: () => {
    // Create some sample binary data
    const buffer = new ArrayBuffer(16);
    const view = new DataView(buffer);
    for (let i = 0; i < 4; i++) {
      view.setUint32(i * 4, Math.floor(Math.random() * 1000000));
    }
    downloadContent([buffer, "application/octet-stream"], "binary-data.bin");
  },

  downloadTypedArray: () => {
    // Create a typed array with sample data
    const uint8Array = new Uint8Array(app.model.args.numbers.map((n) => n % 256));
    downloadContent([uint8Array, "application/octet-stream"], "typed-array.dat");
  },

  downloadBlob: () => {
    // Create a blob directly
    const blobData = new Blob(["This is blob content"], { type: "text/plain" });
    downloadContent(blobData, "blob-example.txt");
  },
};
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <PlAlert label="Download Examples (using URL.createObjectURL)" type="info">
      <PlRow>
        <PlBtnPrimary @click="downloadExampleFiles.downloadJSON"> Download JSON </PlBtnPrimary>
        <PlBtnPrimary @click="downloadExampleFiles.downloadCSV"> Download CSV </PlBtnPrimary>
        <PlBtnPrimary @click="downloadExampleFiles.downloadText"> Download Text </PlBtnPrimary>
      </PlRow>
      <PlRow>
        <PlBtnPrimary @click="downloadExampleFiles.downloadBinaryData">
          Download Binary Data
        </PlBtnPrimary>
        <PlBtnPrimary @click="downloadExampleFiles.downloadTypedArray">
          Download Typed Array
        </PlBtnPrimary>
        <PlBtnPrimary @click="downloadExampleFiles.downloadBlob"> Download Blob </PlBtnPrimary>
      </PlRow>
    </PlAlert>
  </PlBlockPage>
</template>
