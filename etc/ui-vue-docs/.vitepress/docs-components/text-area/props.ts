export default {
  modelValue: {
    type: '?: string',
    description: 'The current value of the texarea',
  },
  label: {
    type: '?: string',
    description: 'The label to display above the texarea',
  },
  required: {
    type: '?: boolean',
    description: 'If `true`, the textarea is marked as required',
  },
  error: {
    type: '?: string',
    description: 'An error message to display below the textarea',
  },
  helper: {
    type: '?: string',
    description:
      'A helper text to display below the textarea when there are no errors.',
  },
  placeholder: {
    type: '?: string',
    description:
      'A placeholder text to display inside the textarea when it is empty.',
  },
  disabled: {
    type: '?: boolean',
    description:
      'If `true`, the textarea is disabled and cannot be interacted with.',
  },
  readonly: {
    type: '?: boolean',
    description:
      'If `true`, the textarea is in a read-only state and cannot be edited, but it can still be focused and text can be selected.',
  },
  dashed: {
    type: '?: boolean',
    description:
      'If `true`, applies a dashed border style to the textarea, likely used for stylistic purposes or to indicate a certain state.',
  },
  rows: {
    type: '?: number',
    description:
      'The number of visible text lines for the textarea, which controls the height of the textarea.',
  },
  autogrow: {
    type: '?: bolean',
    description:
      'If `true`, the textarea automatically adjusts its height to fit the content as the user types',
  },
  rules: {
    type: '?: ((v: string) => boolean | string)[]',
    description:
      'An array of validation rules to apply to the input field. Each rule is a function that takes the current value and returns `true` if valid or an error message if invalid',
  },
};
