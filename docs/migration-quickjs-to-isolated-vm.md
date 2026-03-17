# Миграция с quickjs-emscripten на isolated-vm

## Context

QuickJS (через `quickjs-emscripten`) используется как sandbox для выполнения недоверенного JS-кода блоков (render-функции, lifecycle callbacks). `quickjs-emscripten` работает через WASM — это двойной overhead и ограниченная совместимость с ES-стандартами. `isolated-vm` предоставляет настоящий V8 Isolate с нативной скоростью, полной ES2024+ поддержкой и реальной изоляцией памяти.

## Маппинг концептов QuickJS → isolated-vm

| QuickJS | isolated-vm |
|---|---|
| `getQuickJS()` → `QuickJSWASMModule` | Не нужен (Isolate создаётся напрямую) |
| `quickJs.newRuntime()` + `setMemoryLimit(8MB)` | `new ivm.Isolate({ memoryLimit: 8 })` |
| `runtime.setInterruptHandler(deadline)` | `{ timeout: 10000 }` на `evalSync`/`applySync` |
| `runtime.newContext()` | `isolate.createContextSync()` |
| `Scope` / `scope.manage(handle)` | Не нужен (V8 GC) |
| `vm.evalCode(code)` | `context.evalSync(code, { timeout })` |
| `vm.callFunction(fn, this, ...args)` | `ref.applySync(this, args, { timeout })` |
| `vm.newString/newNumber/newObject` | Прямая передача значений через `{ copy: true }` |
| `vm.newFunction(name, impl)` | `new ivm.Callback(impl)` |
| `vm.setProp/getProp` | `ref.setSync/getSync` |
| `vm.getString/getNumber/dump` | Значения уже в JS (не нужно unwrap) |
| `exportObjectViaJson` / `importObjectViaJson` | `new ivm.ExternalCopy(obj).copyInto()` / `ref.copySync()` |
| `scope.dispose()` | `isolate.dispose()` |

**Ключевое упрощение:** вся система handle-based маршаллинга (exportSingleValue, exportObjectViaJson, importObjectUniversal) заменяется на прямую передачу значений. `isolated-vm` автоматически сериализует JSON-совместимые данные.

## План реализации

### Шаг 1: Зависимости

**Файлы:**
- `lib/node/pl-middle-layer/package.json` — убрать `quickjs-emscripten`, добавить `isolated-vm`
- `tests/drivers-ml-blocks-integration/package.json` — убрать `quickjs-emscripten`
- `pnpm-workspace.yaml` — обновить каталог зависимостей

### Шаг 2: Переписать `context.ts` (ядро sandbox-обёртки)

**Файл:** `lib/node/pl-middle-layer/src/js_render/context.ts`

Полная переработка `JsExecutionContext`:

- **Конструктор:** `(Scope, QuickJSContext, DeadlineSetter, ...)` → `(ivm.Isolate, ivm.Context, timeout: number, ...)`
- **evaluateBundle:** `vm.evalCode()` → `context.evalSync(code, { filename: "bundle.js", timeout })`
- **runCallback:** `vm.callFunction()` → получить `Reference` из `cfgRenderCtx.callbackRegistry`, вызвать `ref.applySync()`
- **Убрать:** `exportSingleValue`, `exportObjectViaJson`, `importObjectViaJson` — заменить прямой передачей значений
- **importObjectUniversal:** упростить до `ref instanceof ivm.Reference ? ref.copySync() : ref`
- **injectCtx:** `vm.newObject()` + `vm.setProp()` → `context.evalSync('globalThis.cfgRenderCtx = { callbackRegistry: {} }')` + `ref.setSync()`
- **ErrorRepository:** сохранить UUID-паттерн, но `getOriginal` проверяет паттерн `/uuid:` в message вместо `instanceof QuickJSUnwrapError`

### Шаг 3: Переписать `computable_context.ts` (~40 host-функций)

**Файл:** `lib/node/pl-middle-layer/src/js_render/computable_context.ts`

Механическая трансформация каждой функции:

```typescript
// Было:
exportCtxFunction("methodName", (handle, key) => {
  return parent.exportSingleValue(
    this.someMethod(vm.getString(handle), vm.getString(key))
  );
});

// Стало:
cfgRef.setSync("methodName", new ivm.Callback((...args: any[]) => {
  try {
    return new ivm.ExternalCopy(this.someMethod(args[0], args[1])).copyInto();
  } catch (e) {
    throw parent.errorRepo.wrapForSandbox(e);
  }
}));
```

- Убрать `vm.getString()`, `vm.getNumber()`, `vm.dump()` — аргументы уже JS-значения
- Убрать `parent.exportSingleValue()` — возвращать значения напрямую
- Для объектов использовать `new ivm.ExternalCopy(value).copyInto()`
- Для примитивов (string, number, boolean, undefined) — возвращать как есть
- Lazy state функции (`args`, `data`, `blockStorage`) — возвращать строку или `undefined`
- `exportCtxFunction` helper → новый helper, оборачивающий в `ivm.Callback` с error handling

### Шаг 4: Переписать `index.ts` (точки входа)

**Файл:** `lib/node/pl-middle-layer/src/js_render/index.ts`

**`computableFromRF`:**
```typescript
// Было:
const scope = new Scope();
const runtime = scope.manage(env.quickJs.newRuntime());
runtime.setMemoryLimit(1024 * 1024 * 8);
runtime.setMaxStackSize(1024 * 320);
runtime.setInterruptHandler(() => Date.now() > deadline);
const vm = scope.manage(runtime.newContext());

// Стало:
const isolate = new ivm.Isolate({ memoryLimit: 8 });
const context = isolate.createContextSync();
```

- Async path: `runCallback` возвращает `ivm.Reference` (не копировать!), после resolve futures — `ref.copySync()`
- `scope.dispose()` → `isolate.dispose()`
- `keepVmAlive` / `addOnDestroy` — та же логика, но dispose isolate вместо scope

**`executeSingleLambda`:**
- Убрать параметр `quickJs: QuickJSWASMModule`
- Создавать `new ivm.Isolate()` внутри, dispose в finally

### Шаг 5: Обновить потребителей

**`lib/node/pl-middle-layer/src/middle_layer/middle_layer.ts`:**
- Убрать `import { getQuickJS }` и `import type { QuickJSWASMModule }`
- Убрать `const quickJs = await getQuickJS()` из `init()`
- Убрать `quickJs` из `MiddleLayerEnvironment`
- Обновить конструктор `ProjectHelper`

**`lib/node/pl-middle-layer/src/model/project_helper.ts`:**
- Убрать `QuickJSWASMModule` из конструктора
- Все вызовы `executeSingleLambda(this.quickJs, ...)` → `executeSingleLambda(...)`

### Шаг 6: Ошибки

**`lib/node/pl-errors/src/parsed_error.ts`:**
- Переименовать `PlQuickJSError` → `PlSandboxError` (оставить alias для обратной совместимости)

### Шаг 7: Тесты

**Файлы:**
- `lib/node/pl-middle-layer/src/middle_layer/render.test.ts`
- `lib/node/pl-middle-layer/src/mutator/project.test.ts`
- `lib/node/pl-middle-layer/src/mutator/project-v3.test.ts`

- Убрать импорты `quickjs-emscripten`
- Убрать `const quickJs = await getQuickJS()` из setup
- Тестовая логика не должна меняться (внешний API сохраняется)

## Риски

1. **Async reference pattern** — в async path результат хранится как живой handle в VM. Нужно использовать `ivm.Reference` (не копировать), чтобы mutations через callbacks отражались. Проверить тестом.

2. **ivm.Callback ограничения** — аргументы и возврат должны быть transferable. Текущий код передаёт в основном строки и JSON — должно работать. `ArrayBuffer` нужно тестировать с `ExternalCopy`.

3. **Native addon** — `isolated-vm` требует компиляции (C++). Проверить prebuild для всех целевых платформ (Linux x64, macOS arm64/x64). Есть prebuild-install.

4. **Error propagation** — поведение отличается от QuickJS. Сохраняем ErrorRepository с UUID, но адаптируем детекцию.

5. **Stack size** — QuickJS: 320KB явно. V8: ~1MB по умолчанию. Не критично при memory limit 8MB.

## Верификация

1. `pnpm --filter pl-middle-layer test` — все существующие тесты
2. `pnpm --filter drivers-ml-blocks-integration test` — интеграционные тесты
3. Ручная проверка: запустить desktop app, открыть проект с блоками, убедиться что render-функции работают
4. Проверить timeout: блок с `while(true){}` должен прерваться за 10 сек
