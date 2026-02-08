# PlElementList

A universal component for displaying lists of elements with support for drag & drop, pinning, toggling, content expansion, and element removal.

## Key Features

- **Drag & Drop**: Drag elements to reorder them
- **Pinning**: Pin important elements to the top of the list
- **Toggle**: Toggle element states (enabled/disabled)
- **Expand/Collapse**: Expand additional element content
- **Remove**: Remove elements from the list
- **Active State**: Highlight active elements

## Props

### Data Model

| Prop    | Type  | Default      | Description                          |
| ------- | ----- | ------------ | ------------------------------------ |
| `items` | `T[]` | _(required)_ | Array of list items. Used as v-model |

### Item Keys

| Prop         | Type                            | Default                | Description                            |
| ------------ | ------------------------------- | ---------------------- | -------------------------------------- |
| `getItemKey` | `(item: T, index: number) => K` | `JSON.stringify(item)` | Function to get unique key for an item |

### Styling

| Prop        | Type                                                                     | Default     | Description                       |
| ----------- | ------------------------------------------------------------------------ | ----------- | --------------------------------- |
| `itemClass` | `string \| string[] \| ((item: T, index: number) => string \| string[])` | `undefined` | CSS classes for list items        |
| `isActive`  | `(item: T, index: number) => boolean`                                    | `undefined` | Function to determine active item |

### Drag & Drop

| Prop              | Type                                                      | Default     | Description                            |
| ----------------- | --------------------------------------------------------- | ----------- | -------------------------------------- |
| `disableDragging` | `boolean`                                                 | `false`     | Completely disable dragging            |
| `isDraggable`     | `(item: T, index: number) => boolean`                     | `true`      | Function to check if item is draggable |
| `onDragEnd`       | `(oldIndex: number, newIndex: number) => void \| boolean` | `undefined` | Callback when dragging ends            |
| `onSort`          | `(oldIndex: number, newIndex: number) => void \| boolean` | `undefined` | Callback when item order changes       |

### Removal

| Prop              | Type                                          | Default     | Description                            |
| ----------------- | --------------------------------------------- | ----------- | -------------------------------------- |
| `disableRemoving` | `boolean`                                     | `false`     | Completely disable removal             |
| `isRemovable`     | `(item: T, index: number) => boolean`         | `undefined` | Function to check if item is removable |
| `onRemove`        | `(item: T, index: number) => void \| boolean` | `undefined` | Callback when item is removed          |

### Content Expansion

| Prop               | Type                                  | Default     | Description                              |
| ------------------ | ------------------------------------- | ----------- | ---------------------------------------- |
| `disableExpanding` | `boolean`                             | `false`     | Completely disable expansion             |
| `isExpandable`     | `(item: T, index: number) => boolean` | `undefined` | Function to check if item is expandable  |
| `isExpanded`       | `(item: T, index: number) => boolean` | `undefined` | Function to check if item is expanded    |
| `onExpand`         | `(item: T, index: number) => unknown` | `undefined` | Callback when item is expanded/collapsed |

### State Toggling

| Prop              | Type                                  | Default     | Description                             |
| ----------------- | ------------------------------------- | ----------- | --------------------------------------- |
| `disableToggling` | `boolean`                             | `false`     | Completely disable toggling             |
| `isToggable`      | `(item: T, index: number) => boolean` | `undefined` | Function to check if item is toggleable |
| `isToggled`       | `(item: T, index: number) => boolean` | `undefined` | Function to check if item is toggled    |
| `onToggle`        | `(item: T, index: number) => unknown` | `undefined` | Callback when item is toggled           |

### Pinning

| Prop             | Type                                          | Default     | Description                           |
| ---------------- | --------------------------------------------- | ----------- | ------------------------------------- |
| `disablePinning` | `boolean`                                     | `false`     | Completely disable pinning            |
| `isPinnable`     | `(item: T, index: number) => boolean`         | `undefined` | Function to check if item is pinnable |
| `isPinned`       | `(item: T, index: number) => boolean`         | `undefined` | Function to check if item is pinned   |
| `onPin`          | `(item: T, index: number) => void \| boolean` | `undefined` | Callback when item is pinned/unpinned |

## Events

| Event       | Type                | Description                     |
| ----------- | ------------------- | ------------------------------- |
| `itemClick` | `(item: T) => void` | Emitted when an item is clicked |

## Slots

| Slot           | Props                        | Description                          |
| -------------- | ---------------------------- | ------------------------------------ |
| `item-title`   | `{ item: T, index: number }` | _(Required)_ Content for item title  |
| `item-content` | `{ item: T, index: number }` | _(Optional)_ Expandable item content |

## Usage Examples

### Simple Example

Basic string list with drag and remove functionality:

```vue
<template>
  <PlElementList v-model:items="items">
    <template #item-title="{ item }">
      {{ item }}
    </template>
  </PlElementList>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { PlElementList } from "@/components/PlElementList";

const items = ref(["First item", "Second item", "Third item"]);

function handleRemove(item: string, index: number): boolean {
  const confirmed = confirm(`Remove "${item}"?`);
  return confirmed; // return false to cancel removal
}
</script>
```

### Advanced Example

Full-featured task list with all functionality:

```vue
<template>
  <PlElementList
    v-model:items="tasks"
    :getItemKey="(task) => task.id"
    :itemClass="getTaskClass"
    :isActive="(task) => task.id === activeTaskId"
    :isRemovable="(task) => !task.isProtected"
    :onRemove="handleRemoveTask"
    :isExpandable="(task) => task.details.length > 0"
    :isExpanded="(task) => expandedTasks.includes(task.id)"
    :onExpand="handleExpandTask"
    :isToggable="() => true"
    :isToggled="(task) => task.completed"
    :onToggle="handleToggleTask"
    :isPinnable="(task) => task.priority === 'high'"
    :isPinned="(task) => task.pinned"
    :onPin="handlePinTask"
    :onSort="handleSortTasks"
    @itemClick="setActiveTask"
  >
    <template #item-title="{ item: task }">
      <div class="task-title">
        <span class="task-name" :class="{ completed: task.completed }">
          {{ task.name }}
        </span>
        <span v-if="task.priority === 'high'" class="priority-badge"> High Priority </span>
        <span class="task-date">
          {{ formatDate(task.dueDate) }}
        </span>
      </div>
    </template>

    <template #item-content="{ item: task }">
      <div class="task-details">
        <p class="task-description">{{ task.description }}</p>
        <ul class="task-subtasks">
          <li v-for="subtask in task.details" :key="subtask.id">
            <input
              type="checkbox"
              :checked="subtask.completed"
              @change="toggleSubtask(task.id, subtask.id)"
            />
            {{ subtask.name }}
          </li>
        </ul>
        <div class="task-tags">
          <span v-for="tag in task.tags" :key="tag" class="tag">
            {{ tag }}
          </span>
        </div>
      </div>
    </template>
  </PlElementList>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { PlElementList } from "@/components/PlElementList";

interface Task {
  id: string;
  name: string;
  description: string;
  completed: boolean;
  priority: "low" | "medium" | "high";
  dueDate: Date;
  pinned: boolean;
  isProtected: boolean;
  tags: string[];
  details: Array<{
    id: string;
    name: string;
    completed: boolean;
  }>;
}

const tasks = ref<Task[]>([
  {
    id: "1",
    name: "Develop new feature",
    description: "Create a component for displaying task lists",
    completed: false,
    priority: "high",
    dueDate: new Date("2025-07-15"),
    pinned: true,
    isProtected: false,
    tags: ["frontend", "vue", "typescript"],
    details: [
      { id: "1-1", name: "Create component", completed: true },
      { id: "1-2", name: "Write tests", completed: false },
      { id: "1-3", name: "Add documentation", completed: false },
    ],
  },
  {
    id: "2",
    name: "Code review",
    description: "Review colleague's pull request",
    completed: true,
    priority: "medium",
    dueDate: new Date("2025-07-10"),
    pinned: false,
    isProtected: true,
    tags: ["review"],
    details: [],
  },
  {
    id: "3",
    name: "Update dependencies",
    description: "Update project packages to latest versions",
    completed: false,
    priority: "low",
    dueDate: new Date("2025-07-20"),
    pinned: false,
    isProtected: false,
    tags: ["maintenance", "dependencies"],
    details: [
      { id: "3-1", name: "Check compatibility", completed: false },
      { id: "3-2", name: "Run tests", completed: false },
    ],
  },
]);

const activeTaskId = ref<string | null>("1");
const expandedTasks = ref<string[]>(["1"]);

function getTaskClass(task: Task, index: number): string[] {
  const classes = ["task-item"];

  if (task.completed) classes.push("completed");
  if (task.priority === "high") classes.push("high-priority");
  if (task.isProtected) classes.push("protected");

  return classes;
}

function setActiveTask(task: Task) {
  activeTaskId.value = task.id;
}

function handleRemoveTask(task: Task, index: number): boolean {
  if (task.isProtected) {
    alert("This task cannot be deleted");
    return false;
  }

  const confirmed = confirm(`Delete task "${task.name}"?`);
  return confirmed;
}

function handleExpandTask(task: Task, index: number) {
  const taskIndex = expandedTasks.value.indexOf(task.id);

  if (taskIndex >= 0) {
    expandedTasks.value.splice(taskIndex, 1);
  } else {
    expandedTasks.value.push(task.id);
  }
}

function handleToggleTask(task: Task, index: number) {
  task.completed = !task.completed;
}

function handlePinTask(task: Task, index: number): boolean {
  if (task.priority !== "high") {
    alert("Only high priority tasks can be pinned");
    return false;
  }

  task.pinned = !task.pinned;
  return true;
}

function handleSortTasks(oldIndex: number, newIndex: number): boolean {
  console.log(`Task moved from position ${oldIndex} to position ${newIndex}`);
  // Return true to allow the move
  return true;
}

function toggleSubtask(taskId: string, subtaskId: string) {
  const task = tasks.value.find((t) => t.id === taskId);
  if (!task) return;

  const subtask = task.details.find((st) => st.id === subtaskId);
  if (subtask) {
    subtask.completed = !subtask.completed;
  }
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US");
}
</script>
```

## Notes

### Callback Function Behavior

If callback functions (`onRemove`, `onPin`, `onSort`, `onDragEnd`) return `false`, the corresponding action will be cancelled.

### Automatic Feature Detection

If explicit state checking functions (e.g., `isPinnable`) are not provided, the component automatically determines feature availability based on the presence of corresponding callbacks or state functions.
