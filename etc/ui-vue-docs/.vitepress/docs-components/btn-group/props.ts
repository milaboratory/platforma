export default {
  modelValue: {
    type: '?: M',
    description: 'The current selected value (required)',
  },
  options: {
    type: `: <T = unknown> = {
text: string;
value: T;
}[]`,
    description: 'List of available options for the component',
  },
  label: {
    type: '?: string',
    description:
      'An optional label that provides a description or context for the button group, helping users understand its purpose.',
  },
  disabled: {
    type: '?: boolean',
    description:
      'If `true`, the component is disabled and cannot be interacted with.',
  },
  helper: {
    type: '?: string',
    description:
      'A helper text displayed below the component when there are no errors (optional).',
  },
  error: {
    type: '?: string',
    description:
      'Error message displayed below the component (optional)',
  },
};
