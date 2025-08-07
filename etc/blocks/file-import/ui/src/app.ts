import { platforma } from '@milaboratories/milaboratories.file-import-block.model';
import { defineApp } from '@platforma-sdk/ui-vue';
import MainPage from './MainPage.vue';

export const sdkPlugin = defineApp(platforma, (base) => {
  return {
    routes: {
      '/': () => MainPage
    }
  };
});

export const useApp = sdkPlugin.useApp;


// const onDrop = async (ev: DragEvent) => {
//   const fileToImportHandle = getRawPlatformaInstance()?.lsDriver?.fileToImportHandle;

//   if (!fileToImportHandle) {
//     return console.error('API getPlatformaRawInstance().lsDriver.fileToImportHandle is not available');
//   }

//   const extensions = normalizeExtensions(props.extensions);

//   const files = await Promise.all(
//     [...(ev.dataTransfer?.files ?? [])]
//       .filter((f) => !!f)
//       .filter((f) => (extensions ? extensions.some((ext) => f.name.endsWith(ext)) : true))
//       .map((file) => {
//         return fileToImportHandle(file);
//       }),
//   );

//   if (files.length) {
//     props.importFiles({
//       files,
//     });
//   }
// };

