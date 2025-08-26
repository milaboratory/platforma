// TypeScript bindings for emscripten-generated code.  Automatically generated at compile time.
declare namespace RuntimeExports {
    function FS_readFile(...args: any[]): any;
    function FS_writeFile(...args: any[]): any;
    let callMain: any;
}
interface WasmModule {
  _main(_0: number, _1: number): number;
}

export type MainModule = WasmModule & typeof RuntimeExports;
export default function MainModuleFactory (options?: unknown): Promise<MainModule>;
