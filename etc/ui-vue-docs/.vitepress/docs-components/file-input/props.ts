export default {
  modelValue: {
    type: ': ImportFileHandle | undefined',
    description: 'The current import file handle',
  },
  label: {
    type: ':? string',
    description: 'The label to display above the input field',
  },
  required: {
    type: '?: boolean',
    description:
      'If `true`, the file input component is marked as required.',
  },
  disabled: {
    type: '?: boolean',
    description:
      'If `true`, the file input component is disabled and cannot be interacted with.',
  },
  dashed: {
    type: '?: boolean',
    description: 'If `true`, the component border is dashed.',
  },
  extensions: {
    type: '?: string[]',
    description: 'Allowed file extensions (should start with `.`)',
  },
  fileDialogTitle: {
    type: '?: string',
    description: 'File dialog (modal) title',
  },
  placeholder: {
    type: '?: string',
    description: 'Placeholder text',
  },
  progress: {
    type: '?: ImportProgress',
    description: 'Import/Upload progress',
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
  showFilenameOnly: {
    type: '?: boolean',
    description:
      'If `true`, only the file name is displayed, not the full path to it.',
  },
};
