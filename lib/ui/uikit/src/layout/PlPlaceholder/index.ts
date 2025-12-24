export {
  default as PlPlaceholder,
  type PlPlaceholderProps,
} from './PlPlaceholder.vue';

export const PL_PLACEHOLDER_TEXTS = {
  LOADING: {
    title: 'Loading data...',
    subtitle: [
      'No action needed—the job is active',
      'Larger datasets take longer to load',
      'Results will appear here as soon as they’re ready',
      'Loading may take minutes to hours',
    ],
  },
  RUNNING: {
    title: 'Running analysis...',
    subtitle: [
      'No action needed—the job is active',
      'Larger datasets take longer to process',
      'Results will appear here as soon as they’re ready',
      'Processing may take minutes to hours',
    ],
  },
};
