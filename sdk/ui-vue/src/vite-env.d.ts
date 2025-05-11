/// <reference types="vite/client" />

// declare module '*.vue' {
//   import type { DefineComponent } from 'vue';
//   // eslint-disable-next-line @typescript-eslint/ban-types, @typescript-eslint/no-explicit-any
//   const component: DefineComponent<{}, {}, any>;
//   export default component;
// }

declare module '@biowasm/aioli' {
  class Aioli {
    constructor(tools: string[]);
    mount(options: { name: string; data: string }): Promise<void>;
    exec(command: string): Promise<unknown>;
    cat(filename: string): Promise<string>;
    // Add any other methods used or known
  }
  export default Aioli;
}
