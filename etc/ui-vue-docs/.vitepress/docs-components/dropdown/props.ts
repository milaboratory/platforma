export default {
  modelValue: {
    type: '?: M',
    description: 'The current selected value of the dropdown',
  },
  label: {
    type: '?: string',
    description: 'The label text for the dropdown field (optional)',
  },
  options: {
    type: `<M = unknown> {
  label: string;
  description?: string;
  value: M;
}`,
    description:
      'List of available options for the dropdown. Each option should include a value and a text to display.',
  },
  helper: {
    type: '?: string',
    description:
      'An optional helper text that provides additional information or guidance about the model.',
  },
  error: {
    type: '?: string',
    description:
      'An optional error message that is displayed when there is a validation issue with selection.',
  },
  placeholder: {
    type: '?: string',
    description:
      'An optional placeholder text that is displayed when no option is selected, guiding the user on what to do.',
  },
  clearable: {
    type: '?: boolean',
    description:
      'Enables a button to clear the selected value (default: false)',
  },
  required: {
    type: '?: boolean',
    description:
      'If `true`, the dropdown component is marked as required.',
  },
  disabled: {
    type: '?: boolean',
    description:
      'If `true`, the dropdown component is disabled and cannot be interacted with.',
  },
  arrowIcon: {
    type: '?: string',
    description:
      'An optional property to specify a custom arrow icon for thePlDropdown, allowing for visual customization.',
  },
};
