PlElementList.vue
=================

## 1. GENERICS

• **`T`** – Runtime type of a single list element
• **`K`** – Type returned by `getItemKey` (typically `string` or `number`)


## 2. TWO-WAY BINDINGS (`v-model`)

| Model name        | Type     | Purpose / Behaviour                                    |
|-------------------|----------|--------------------------------------------------------|
| `items`*          | `T[]`    | Source array; the list you render & mutate             |
| `draggableItems`  | `Set<T>` | Restricts which items may be dragged                   |
| `removableItems`  | `Set<T>` | Restricts which items may be removed                   |
| `expandableItems` | `Set<T>` | Restricts which items may be expanded                  |
| `expandedItems`   | `Set<T>` | Tracks the expand/collapse state per item              |
| `pinnableItems`   | `Set<T>` | Restricts which items may be pinned                    |
| `pinnedItems`     | `Set<T>` | Tracks the *current* pinned elements                   |
| `toggableItems`   | `Set<T>` | Restricts which items may be toggled (show/hide)       |
| `toggledItems`    | `Set<T>` | Tracks the visibility toggle state per item            |

(*required)

## 3. PROPS

| Prop             | Type                                                      | Default     | Notes                                           |
|------------------|-----------------------------------------------------------|-------------|-------------------------------------------------|
| `getItemKey`     | `(item:T) ⇒ K`                                            | —           | Stable key for `v-for` & SortableJS            |
| `itemClass`      | `string \| string[] \| ((item:T, index:number) ⇒ string \| string[])` | — | CSS classes for individual items |
| `activeItems`    | `Set<T>`                                                  | —           | Set of currently active items                   |
| **Sorting**      |                                                           |             |                                                 |
| `enableDragging` | `boolean`                                                 | `undefined` | Master switch for drag-and-drop                |
| `onDragEnd`      | `(oldIdx:number, newIdx:number) ⇒ void\|bool`            | —           | Fired by SortableJS; return **false** to ignore |
| `onSort`         | `(oldIdx:number, newIdx:number) ⇒ void\|bool`            | —           | Return **false** to cancel applying new order  |
| **Removing**     |                                                           |             |                                                 |
| `enableRemoving` | `boolean`                                                 | `undefined` | `true` ⇒ always show remove, `false` ⇒ never    |
| `onRemove`       | `(item:T, index:number) ⇒ void\|bool`                    | —           | Return **false** to veto                        |
| **Expanding**    |                                                           |             |                                                 |
| `enableExpanding`| `boolean`                                                 | `undefined` | Master switch for expand/collapse               |
| `onExpand`       | `(item:T, index:number) ⇒ void\|bool`                    | —           | Return **false** to veto                        |
| **Toggling**     |                                                           |             |                                                 |
| `enableToggling` | `boolean`                                                 | `undefined` | Master switch for visibility toggle             |
| `onToggle`       | `(item:T, index:number) ⇒ void\|bool`                    | —           | Return **false** to veto                        |
| **Pinning**      |                                                           |             |                                                 |
| `enablePinning`  | `boolean`                                                 | `undefined` | Master switch for pinning                       |
| `onPin`          | `(item:T, index:number) ⇒ void\|bool`                    | —           | Return **false** to veto                        |


## 4. SLOTS

- **`item-title`** – **required**. Receives `{ item, index }`.
- **`item-content`** – optional. Same slot props; rendered only when the item
  is in the “opened” state (`toggleContent` event).


## 5. EVENTS

| Event      | Payload             | Description                                    |
|------------|---------------------|------------------------------------------------|
| `itemClick`| `(item: T)`         | Emitted when an item is clicked               |

Additionally, these events bubble up from `<PlElementListItem>`:
- `remove` – `(item: T, index: number)` 
- `toggle` – `(item: T, index: number)` 
- `pin` – `(item: T, index: number)` 
- `expand` – `(item: T, index: number)`


## 6. EXAMPLE USAGE

```vue
<PlElementList
    v-model:items="elements"
    v-model:pinnedItems="pinned"
    v-model:expandedItems="expanded"
    v-model:toggledItems="hidden"
    :getItemKey="el => el.id"
    :onSort="(oldIdx, newIdx) => api.saveOrder(oldIdx, newIdx)"
    :activeItems="activeSet"
    :itemClass="(item, index) => ({ 'special-item': item.isSpecial })"
    @itemClick="handleItemClick"
>
  <template #item-title="{ item }">
    {{ item.name }}
  </template>
  <template #item-content="{ item }">
    <pre>{{ JSON.stringify(item.meta, null, 2) }}</pre>
  </template>
</PlElementList>
```
