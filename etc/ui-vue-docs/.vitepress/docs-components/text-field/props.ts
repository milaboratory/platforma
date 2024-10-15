export default {
  modelValue: {
    type: ': M extends string | null | undefined',
    description: 'The current value of the input field',
  },
  label: {
    type: '?: string',
    description: 'The label to display above the input field',
  },
  clearable: {
    type: '?: boolean | (() => E)',
    description: `If true, a clear icon will appear in the input field to clear the value (set it to 'undefined').
 Or you can pass a callback that returns null | undefined | string`,
  },
  required: {
    type: '?: boolean',
    description: 'If `true`, the input field is marked as required',
  },
  error: {
    type: '?: string',
    description:
      'An optional error message to display below the input field.',
  },
  helper: {
    type: '?: string',
    description:
      'A helper text to display below the input field when there are no errors.',
  },
  placeholder: {
    type: '?: string',
    description:
      'A placeholder text to display inside the input field when it is empty.',
  },
  disabled: {
    type: '?: boolean',
    description:
      'If `true`, the input field is disabled and cannot be interacted with.',
  },
  dashed: {
    type: '?: boolean',
    description: 'If `true`, the input field has a dashed border.',
  },
  prefix: {
    type: '?: string',
    description:
      'A prefix text to display inside the input field before the value.',
  },
  rules: {
    type: '?: ((v: string) => boolean | string)[]',
    description:
      'An array of validation rules to apply to the input field. Each rule is a function that takes the current value and returns `true` if valid or an error message if invalid',
  },
};
