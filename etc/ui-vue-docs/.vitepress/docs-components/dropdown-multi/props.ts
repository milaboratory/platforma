export default {
  modelValue: {
    type: ': M[]',
    description: 'The current selected values',
  },
  label: {
    type: '?: string',
    description: 'The label text for the component (optional)',
  },
  options: {
    type: `<M = unknown> {
  label: string;
  description?: string;
  value: M;
}[]`,
    description: 'List of available options for the component',
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
  required: {
    type: '?: boolean',
    description: 'If `true`, the component is marked as required.',
  },
  disabled: {
    type: '?: boolean',
    description:
      'If `true`, the component is disabled and cannot be interacted with.',
  },
};
