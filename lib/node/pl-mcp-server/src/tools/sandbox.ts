import { getQuickJS, type QuickJSRuntime } from "quickjs-emscripten";

/** Lazily initialized QuickJS runtime shared across evaluations. */
let sharedRuntime: QuickJSRuntime | undefined;

async function getRuntime(): Promise<QuickJSRuntime> {
  if (!sharedRuntime) {
    const quickjs = await getQuickJS();
    sharedRuntime = quickjs.newRuntime();
    sharedRuntime.setMemoryLimit(1024 * 1024 * 16); // 16 MB
    sharedRuntime.setMaxStackSize(1024 * 320);
  }
  return sharedRuntime;
}

/**
 * Evaluate a JS expression in a QuickJS sandbox.
 * Variables from `context` are injected as globals.
 * Data is marshaled via JSON — no access to Node APIs, filesystem, or process.
 */
export async function safeEval(
  expression: string,
  context: Record<string, unknown>,
  timeout: number,
): Promise<unknown> {
  const runtime = await getRuntime();

  // Set interrupt handler for timeout
  const deadline = Date.now() + timeout;
  runtime.setInterruptHandler(() => Date.now() > deadline);

  const vm = runtime.newContext();
  try {
    // Inject context variables via JSON
    const contextJson = JSON.stringify(context);
    const setup = `const __ctx = JSON.parse(${JSON.stringify(contextJson)});
${Object.keys(context)
  .map((k) => `const ${k} = __ctx[${JSON.stringify(k)}];`)
  .join("\n")}`;
    const setupResult = vm.evalCode(setup, "setup.js", { type: "global" });
    if (setupResult.error) {
      const err = vm.dump(setupResult.error);
      setupResult.error.dispose();
      throw new Error(`Context setup failed: ${err}`);
    }
    setupResult.value.dispose();

    // Evaluate the expression
    const result = vm.evalCode(`JSON.stringify((${expression}))`, "transform.js");
    if (result.error) {
      const err = vm.dump(result.error);
      result.error.dispose();
      throw new Error(String(err));
    }
    const json = vm.getString(result.value);
    result.value.dispose();
    return JSON.parse(json);
  } finally {
    runtime.setInterruptHandler(() => false);
    vm.dispose();
  }
}
