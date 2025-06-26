PlElementList.vue
=================
A **generic, feature-rich list component** that supports drag-and-drop re-ordering,
pin/unpin, expand/collapse, and optional removal of items. Written in the
`<script setup lang="ts">` style and fully type-safe thanks to the generic
parameters **`T`** (item type) and **`K`** (key type).
---------------------------------------------------------------------------

1. GENERICS

---------------------------------------------------------------------------
• **`T`** – Runtime type of a single list element
• **`K`** – Type returned by `getItemKey` (typically `string` or `number`)
---------------------------------------------------------------------------

2. TWO-WAY BINDINGS (`v-model`)

---------------------------------------------------------------------------

| Model name       | Type     | Purpose / Behaviour                                    |
|------------------|----------|--------------------------------------------------------|
| `items`*         | `T[]`    | Source array; the list you render & mutate             |
| `draggableItems` | `Set<T>` | Restricts which items may be dragged                   |
| `removableItems` | `Set<T>` | Restricts which items may be removed                   |
| `pinnableItems`  | `Set<T>` | Restricts which items may be pinned                    |
| `pinnedItems`    | `Set<T>` | Tracks the *current* pinned elements                   |
| `toggableItems`  | `Set<T>` | Restricts which items may be toggled (expand/collapse) |
| `toggledItems`   | `Set<T>` | Tracks the expand/collapse state per item              |

(*required)
All sets are **fully replaceable**; assign a new `Set()` to trigger re-render.
---------------------------------------------------------------------------

3. PROPS

---------------------------------------------------------------------------

| Prop             | Type                                                      | Default     | Notes                                           |
|------------------|-----------------------------------------------------------|-------------|-------------------------------------------------|
| `getItemKey`*    | `(item:T) ⇒ K`                                            | —           | Stable key for `v-for` & SortableJS             |
| **Sorting**      |                                                           |             |                                                 |
| `onSort`         | `(sorted:T[], oldIdx:number, newIdx:number) ⇒ void\|bool` | —           | Return **false** to cancel applying new order   |
| **Dragging**     |                                                           |             |                                                 |
| `enableDragging` | `boolean`                                                 | `true`      | Master switch                                   |
| `onDragEnd`      | `(oldIdx:number, newIdx:number) ⇒ void\|bool`             | —           | Fired by SortableJS; return **false** to ignore |
| **Removing**     |                                                           |             |                                                 |
| `enableRemoving` | `boolean`                                                 | `undefined` | `true` ⇒ always show remove, `false` ⇒ never    |
| `onRemove`       | `(item:T, index:number) ⇒ void\|bool`                     | —           | Return **false** to veto                        |
| **Toggling**     |                                                           |             |                                                 |
| `enableToggling` | `boolean`                                                 | `true`      | Master switch                                   |
| `onToggle`       | `(item:T, index:number) ⇒ void\|bool`                     | —           | Return **false** to veto                        |
| **Pinning**      |                                                           |             |                                                 |
| `enablePinning`  | `boolean`                                                 | `true`      | Master switch                                   |
| `onPin`          | `(item:T, index:number) ⇒ void\|bool`                     | —           | Return **false** to veto                        |

---------------------------------------------------------------------------

4. SLOTS

---------------------------------------------------------------------------

- **`item-title`** – **required**. Receives `{ item, index }`.
- **`item-content`** – optional. Same slot props; rendered only when the item
  is in the “opened” state (`toggleContent` event).

---------------------------------------------------------------------------

5. EVENTS EMITTED BY `<PlElementListItem>`

---------------------------------------------------------------------------
`remove`, `toggle`, `pin`, `toggleContent` – all bubble up with
`(item:T, index:number)` so you can hook into your own logic if the higher-level
callbacks are not enough.
---------------------------------------------------------------------------

6. BEHAVIOUR SUMMARY

---------------------------------------------------------------------------

- **Drag-and-drop** – powered by `useSortable()` (SortableJS).
- **Pinning** – moves an item between “pinned” and “unpinned” regions; the two
  regions render in separate `<div>` containers for visual clarity.
- **Toggling** – expands/collapses the content slot and updates `toggledItems`.
- **Removing** – deletes the item from `items` after `onRemove` (if supplied)
  resolves to anything except `false`.
- **Versioning** (`versionRef`) – a shallow hash of the items array keeps Vue
  keys stable even when the array reference itself is unchanged but content
  reorders.

---------------------------------------------------------------------------

7. EXAMPLE USAGE

---------------------------------------------------------------------------

```vue

<PlElementList
    v-model:items="elements"
    v-model:pinnedItems="pinned"
    v-model:toggledItems="opened"
    :getItemKey="el => el.id"
    :onSort="(newArr) => api.saveOrder(newArr)"
>
  <template #item-title="{ item }">
    {{ item.name }}
  </template>
  <template #item-content="{ item }">
    <pre>{{ JSON.stringify(item.meta, null, 2) }}</pre>
  </template>
</PlElementList>
```

---------------------------------------------------------------------------

8. CAVEATS

---------------------------------------------------------------------------

1. Each item **must** be referentially stable or provide a deterministic key.
2. Never mutate `items` in place; always assign a new array to preserve reactivity.
3. Indexes supplied to callbacks are **visual** indexes (pinned items are listed
   first).
