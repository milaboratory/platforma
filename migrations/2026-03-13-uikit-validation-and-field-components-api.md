## PlTextField

### `parse` prop removed — use `PlNumberField` for numeric inputs

The `:parse` prop has been removed from `PlTextField`. If you were using it to parse numbers, switch to `PlNumberField`:

```diff
- <PlTextField v-model="count" :parse="parseNumber" />
+ <PlNumberField v-model="count" />
```

### `model-value` is now required and supports `undefined`

Previously, `v-model` defaulted to `""`. Now it is required and accepts `string | undefined`.

```diff
- <PlTextField v-model="text" />
+ <PlTextField v-model="text" />  <!-- text must be explicitly initialized -->
```

### `rules` → `validate`

The `:rules` array prop has been replaced with a single `:validate` function that returns an error string or `undefined`.

```diff
- <PlTextField :rules="[(v) => v.length > 0 || 'Required']" />
+ <PlTextField :validate="(v) => v.length === 0 ? 'Required' : undefined" />
```

### `clearable` now accepts a factory function

If you need a custom reset value (e.g. `undefined` instead of `""`), pass a function:

```vue
<PlTextField :clearable="() => undefined" />
```

Boolean `true` still resets to `""` as before.

---

## PlNumberField

### `useIncrementButtons` → `disableSteps`

The prop was renamed and its logic inverted.

```diff
- <PlNumberField :use-increment-buttons="false" />
+ <PlNumberField disable-steps />
```

### `updateOnEnterOrClickOutside` removed

This behavior is now the default and only mode — value is always committed on blur or Enter. Remove the prop.

```diff
- <PlNumberField :update-on-enter-or-click-outside="true" />
+ <PlNumberField />
```

### `clearable` prop added

Works the same as in `PlTextField` — pass `true` to show a clear button (resets to `undefined`), or a function for a custom reset value.

### New events: `blur`, `focus`, `enter`

The component now emits `blur`, `focus`, and `enter` events with the parsed model value (`number | undefined`), not the raw DOM event.

```vue
<PlNumberField v-model="num" @blur="(v) => console.log('committed:', v)" />
```

### Validation signature unchanged

`:validate` still expects `(v: number) => string | undefined`.

---

## Validation functions (general)

All validation functions across the codebase now return `string | undefined` instead of `boolean | string`.

```diff
- function validate(v: string): boolean | string {
-   if (!v) return 'Required';
-   return true;
- }
+ function validate(v: string): string | undefined {
+   if (!v) return 'Required';
+   return undefined;
+ }
```
