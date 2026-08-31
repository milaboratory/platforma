import { getQuickJS, shouldInterruptAfterDeadline } from "quickjs-emscripten";

const MEMORY_LIMIT_BYTES = 1024 * 1024 * 16;
const MAX_STACK_SIZE_BYTES = 1024 * 320;

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
  const quickjs = await getQuickJS();
  const runtime = quickjs.newRuntime({
    interruptHandler: shouldInterruptAfterDeadline(Date.now() + timeout),
    memoryLimitBytes: MEMORY_LIMIT_BYTES,
    maxStackSizeBytes: MAX_STACK_SIZE_BYTES,
  });

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
    vm.dispose();
    runtime.dispose();
  }
}
