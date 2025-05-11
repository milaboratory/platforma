import type {
  HighlightedResidue,
} from './utils/colors';

export type SequenceRow = {
  labels: string[];
  sequence: string;
  header: string;
};

export type AlignmentRow = {
  labels: string[];
  header: string;
  sequence: string;
  highlighted: HighlightedResidue[];
};
