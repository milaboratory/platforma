/// <reference types="vite/client" />

// declare module '*.vue' {
//   import type { DefineComponent } from 'vue';
//   // eslint-disable-next-line @typescript-eslint/ban-types, @typescript-eslint/no-explicit-any
//   const component: DefineComponent<{}, {}, any>;
//   export default component;
// }

type Mount = File | { name: string; data: Blob | string };

declare module '@biowasm/aioli' {
  class Aioli {
    constructor(tools: string[]);
    mount(mounts: Mount | Mount[]): Promise<void>;
    exec(command: string): Promise<string>;
    cat(filename: string): Promise<string>;
    // Add any other methods used or known
  }
  export default Aioli;
}
