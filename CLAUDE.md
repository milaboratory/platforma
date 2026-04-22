# Project Conventions

## Vue Reactivity

Avoid deep reactivity. Treat all reactive state as immutable — never mutate objects in-place, always produce new references.

### Rules

1. **`shallowRef` over `ref`** for complex objects. `ref()` wraps entire tree in deep proxies, hiding accidental mutations.

2. **`immer` for complex mutations.** When nested spreads become unreadable, use `produce`. See `PlAdvancedFilter.vue` for pattern.

3. **No `defineModel` for objects.** It creates a writable ref allowing `model.value.prop = x` — silent prop mutation. Use explicit `props` + `emit("update:...")` or callback props instead.

4. **No `v-model` on nested computed properties.** `v-model="computed.nested"` bypasses the computed setter. Use `:model-value` + `@update:model-value`.

5. **Computed getters must not return shared references.** If source is already in the right shape, return a copy, not the same object.

6. **`:model-value` + `@update:model-value`** over `v-model` for complex objects — makes data flow explicit.
