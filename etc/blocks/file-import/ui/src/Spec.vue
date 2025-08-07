<script setup lang="tsx">
import type { Spec } from '@milaboratories/milaboratories.file-import-block.model';
import {
    PlBtnPrimary,
    PlBtnSecondary,
    PlCheckbox,
    PlDropdown,
    PlTextArea,
    PlTextField
} from '@platforma-sdk/ui-vue';
import { ref, watch } from 'vue';
import { useApp } from './app';

const app = useApp();
type MySpec = Pick<Spec, 'axes' | 'columns'>;

// Define types inline for now
type ValueType = 'Int' | 'Long' | 'Float' | 'Double' | 'String';

// Initialize reactive data
const formData = ref<MySpec>({
  axes: [],
  columns: []
});

// Value type options for dropdowns
const valueTypeOptions = [
  { label: 'Int', value: 'Int' as ValueType },
  { label: 'Long', value: 'Long' as ValueType },
  { label: 'Float', value: 'Float' as ValueType },
  { label: 'Double', value: 'Double' as ValueType },
  { label: 'String', value: 'String' as ValueType }
];

// Watch for changes and update app.model.args.spec
watch(formData, (newValue) => {
  app.model.args.spec = newValue;
}, { deep: true });

// Initialize from existing spec if available
if (app.model.args.spec) {
  formData.value = {
    axes: app.model.args.spec.axes || [],
    columns: app.model.args.spec.columns || []
  };
}

// Functions to add/remove axes and columns
const addAxis = () => {
  formData.value.axes.push({
    column: '',
    filterOutRegex: undefined,
    naRegex: undefined,
    allowNA: false,
    spec: {
      type: 'String',
      name: undefined,
      domain: {},
      annotations: {},
      parentAxes: []
    }
  });
};

const removeAxis = (index: number) => {
  formData.value.axes.splice(index, 1);
};

const addColumn = () => {
  formData.value.columns.push({
    column: '',
    filterOutRegex: undefined,
    naRegex: undefined,
    allowNA: true,
    id: undefined,
    spec: {
      valueType: 'String',
      name: undefined,
      domain: {},
      annotations: {},
      parentAxes: []
    }
  });
};

const removeColumn = (index: number) => {
  formData.value.columns.splice(index, 1);
};

// Helper functions for JSON fields
const isValidJSON = (value: string): boolean => {
  if (!value.trim()) return true;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
};

const jsonToString = (obj: Record<string, string> | undefined): string => {
  if (!obj || Object.keys(obj).length === 0) return '';
  return JSON.stringify(obj, null, 2);
};

const stringToJson = (value: string): Record<string, string> => {
  if (!value.trim()) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

// Update functions for JSON fields
const updateAxisDomain = (index: number, value: string) => {
  formData.value.axes[index].spec.domain = stringToJson(value);
};

const updateAxisAnnotations = (index: number, value: string) => {
  formData.value.axes[index].spec.annotations = stringToJson(value);
};

const updateColumnDomain = (index: number, value: string) => {
  formData.value.columns[index].spec.domain = stringToJson(value);
};

const updateColumnAnnotations = (index: number, value: string) => {
  formData.value.columns[index].spec.annotations = stringToJson(value);
};
</script>

<template>
  <div class="spec-form">
    <h2>File Import Specification</h2>
    
    <!-- Axes Section -->
    <div class="section">
      <div class="section-header">
        <h3>Axes Configuration</h3>
        <PlBtnPrimary @click="addAxis">Add Axis</PlBtnPrimary>
      </div>
      
      <div v-if="formData.axes.length === 0" class="empty-state">
        No axes configured. Click "Add Axis" to add your first axis.
      </div>
      
      <div v-for="(axis, index) in formData.axes" :key="index" class="form-group">
        <div class="item-header">
          <h4>Axis {{ index + 1 }}</h4>
          <PlBtnSecondary @click="removeAxis(index)">Remove</PlBtnSecondary>
        </div>
        
        <div class="form-row">
          <PlTextField 
            v-model="axis.column" 
            label="Column" 
            placeholder="Column label from XSV file"
            required
          />
          
          <PlTextField 
            :model-value="axis.filterOutRegex || ''"
            @update:model-value="axis.filterOutRegex = $event || undefined"
            label="Filter Out Regex" 
            placeholder="Regex to filter out rows (optional)"
          />
        </div>
        
        <div class="form-row">
          <PlTextField 
            :model-value="axis.naRegex || ''"
            @update:model-value="axis.naRegex = $event || undefined"
            label="NA Regex" 
            placeholder="Regex to identify N/A values (optional)"
          />
          
          <PlCheckbox 
            :model-value="axis.allowNA || false"
            @update:model-value="axis.allowNA = $event"
            label="Allow NA Values"
          />
        </div>
        
        <!-- Axis Spec -->
        <div class="nested-section">
          <h5>Axis Specification</h5>
          
          <div class="form-row">
            <PlTextField 
              :model-value="axis.spec.name || ''"
              @update:model-value="axis.spec.name = $event || undefined"
              label="Name" 
              placeholder="Axis name (defaults to column label)"
            />
            
            <PlDropdown 
              v-model="axis.spec.type" 
              :options="valueTypeOptions"
              label="Type"
              required
            />
          </div>
          
          <div class="form-row">
            <PlTextArea 
              :model-value="jsonToString(axis.spec.domain)"
              @update:model-value="updateAxisDomain(index, $event)"
              label="Domain (JSON)" 
              placeholder="{}"
              :rules="[(v: string) => isValidJSON(v) || 'Invalid JSON format']"
            />
            
            <PlTextArea 
              :model-value="jsonToString(axis.spec.annotations)"
              @update:model-value="updateAxisAnnotations(index, $event)"
              label="Annotations (JSON)" 
              placeholder="{}"
              :rules="[(v: string) => isValidJSON(v) || 'Invalid JSON format']"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Columns Section -->
    <div class="section">
      <div class="section-header">
        <h3>Columns Configuration</h3>
        <PlBtnPrimary @click="addColumn">Add Column</PlBtnPrimary>
      </div>
      
      <div v-if="formData.columns.length === 0" class="empty-state">
        No columns configured. Click "Add Column" to add your first column.
      </div>
      
      <div v-for="(column, index) in formData.columns" :key="index" class="form-group">
        <div class="item-header">
          <h4>Column {{ index + 1 }}</h4>
          <PlBtnSecondary @click="removeColumn(index)">Remove</PlBtnSecondary>
        </div>
        
        <div class="form-row">
          <PlTextField 
            v-model="column.column" 
            label="Column" 
            placeholder="Column label from XSV file"
            required
          />
          
          <PlTextField 
            :model-value="column.filterOutRegex || ''"
            @update:model-value="column.filterOutRegex = $event || undefined"
            label="Filter Out Regex" 
            placeholder="Regex to filter out rows (optional)"
          />
        </div>
        
        <div class="form-row">
          <PlTextField 
            :model-value="column.naRegex || ''"
            @update:model-value="column.naRegex = $event || undefined"
            label="NA Regex" 
            placeholder="Regex to identify N/A values (optional)"
          />
          
          <PlCheckbox 
            :model-value="column.allowNA || false"
            @update:model-value="column.allowNA = $event"
            label="Allow NA Values"
          />
        </div>
        
        <div class="form-row">
          <PlTextField 
            :model-value="column.id || ''"
            @update:model-value="column.id = $event || undefined"
            label="ID" 
            placeholder="Column ID (defaults to sanitized column label)"
          />
        </div>
        
        <!-- Column Spec -->
        <div class="nested-section">
          <h5>Column Specification</h5>
          
          <div class="form-row">
            <PlTextField 
              :model-value="column.spec.name || ''"
              @update:model-value="column.spec.name = $event || undefined"
              label="Name" 
              placeholder="Column name (defaults to column label)"
            />
            
            <PlDropdown 
              v-model="column.spec.valueType" 
              :options="valueTypeOptions"
              label="Value Type"
              required
            />
          </div>
          
          <div class="form-row">
            <PlTextArea 
              :model-value="jsonToString(column.spec.domain)"
              @update:model-value="updateColumnDomain(index, $event)"
              label="Domain (JSON)" 
              placeholder="{}"
              :rules="[(v: string) => isValidJSON(v) || 'Invalid JSON format']"
            />
            
            <PlTextArea 
              :model-value="jsonToString(column.spec.annotations)"
              @update:model-value="updateColumnAnnotations(index, $event)"
              label="Annotations (JSON)" 
              placeholder="{}"
              :rules="[(v: string) => isValidJSON(v) || 'Invalid JSON format']"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.spec-form {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.section {
  margin-bottom: 40px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.section-header h3 {
  margin: 0;
  color: var(--txt-01);
}

.form-group {
  border: 1px solid var(--border-color-div-grey);
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  background-color: var(--bg-elevated-01);
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color-div-grey);
}

.item-header h4 {
  margin: 0;
  color: var(--txt-01);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}

.nested-section {
  margin-top: 20px;
  padding: 16px;
  background-color: var(--bg-base);
  border-radius: 6px;
  border: 1px solid var(--border-color-div-grey);
}

.nested-section h5 {
  margin: 0 0 16px 0;
  color: var(--txt-01);
  font-size: 14px;
  font-weight: 600;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--txt-03);
  font-style: italic;
  background-color: var(--bg-elevated-01);
  border-radius: 8px;
  border: 1px dashed var(--border-color-div-grey);
}

h2 {
  color: var(--txt-01);
  margin-bottom: 30px;
}

@media (max-width: 768px) {
  .form-row {
    grid-template-columns: 1fr;
  }
  
  .section-header {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  
  .item-header {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
}
</style>