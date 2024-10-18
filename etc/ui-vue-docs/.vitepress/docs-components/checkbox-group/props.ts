export default {
  modelValue: {
    type: 'M[]',
    description: 'The current selected values.',
  },
  label: {
    type: '?: string',
    description: 'The label text for the component (optional)',
  },
  options: {
    type: `<M = unknown> {
  text: string;
  value: M;
}[]`,
    description: 'List of available options for the component',
  },
  disabled: {
    type: '?: boolean',
    description:
      'If `true`, the component is disabled and cannot be interacted with.',
  },
};
