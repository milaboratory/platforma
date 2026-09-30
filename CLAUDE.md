# Project Conventions

## Vue Reactivity

Avoid deep reactivity. Treat all reactive state as immutable — never mutate objects in-place, always produce new references.

### Rules

1. **`shallowRef` over `ref`** for complex objects. `ref()` wraps entire tree in deep proxies, hiding accidental mutations.

2. **`immer` for complex mutations.** When nested spreads become unreadable, use `produce`. See `PlAdvancedFilter.vue` for pattern.

3. **No `defineModel` for objects.** It creates a writable ref allowing `model.value.prop = x` — silent prop mutation. Use explicit `props` with callback props instead (or `update:model-value`, see Component Events rule 3).

4. **No `v-model` on nested computed properties.** `v-model="computed.nested"` bypasses the computed setter. Use `:model-value` + `@update:model-value`.

5. **Computed getters must not return shared references.** If source is already in the right shape, return a copy, not the same object.

6. **`:model-value` + `@update:model-value`** over `v-model` for complex objects — makes data flow explicit.

## Component Events

Vue has `emit`, but we do not use it. A component talks to its parent through callback props, React style: `onSave`, `onSelect`, `onClose`.

### Rules

1. **Callback props, not `defineEmits`.** Declare `onSomething?: (payload: T) => void` in `defineProps` and call it directly. The parent passes `:on-something="handler"`.

2. **The callback is typed and visible in the props contract.** `emit` payloads are not checked at the call site the same way and are invisible in the component's type; a callback prop is an ordinary function type.

3. **The one exception is `update:model-value`** for components that participate in `v-model` from library code (see Vue Reactivity, rule 6). Do not add new `update:*` events beyond it.

## Styles

No SCSS. Write plain CSS — `<style module>` in components, `.css` files elsewhere.

### Rules

1. **No SCSS syntax** in new or edited styles: no `&`, no nesting, no `@import`, no mixins, no `$variables`. Spell every selector out in full.

2. **`<style module>`, not `<style lang="scss" module>`.** A component whose styles you touch loses its `lang="scss"`.

3. **Custom properties for shared values** (`--txt-01`, `--border-color-default`, …), defined in `lib/ui/uikit/src/assets/variables.scss`. They are the replacement for SCSS variables, and they work at runtime, so a theme can redefine them.

4. **Existing `.scss` files stay** until something in them is rewritten. Do not convert a file wholesale as a side errand — convert the block you are already editing.

## Type Assertions

`as` switches the compiler's checking off. Write types the compiler can check instead.

### Rules

1. **`as unknown as` is forbidden everywhere, tests included.** So are `as never` and `as any`: they bypass checking the same way.

2. **`as` only inside a parser.** A cast is allowed only in a function whose job is to turn raw input into a type: parsing a string once it is known to be valid, decoding stored data, branding an id (`asProjectId`, `asFolderId`, `asShareId`) or minting one (`newShareId`). Callers call that function; they do not repeat the cast.

3. **Instead of a cast:** annotate (`const x: T = …`, `.map((p): T => ({ … }))`); use `satisfies T` for a literal that must keep its literal types; destructure rather than `omit(…) as T`; declare the type of component state rather than `undefined as X | undefined`.

4. **Tests may use a plain `as X`**, such as branding an id in a fixture. Fixtures are complete, typed objects — a small factory that fills neutral defaults — never a partial object cast to the full type.

5. **A cast stays only when removing it makes the code worse:** an empty record keyed by a generic type parameter, or `Object.keys` over a record with branded keys. `as const` is not a cast.
