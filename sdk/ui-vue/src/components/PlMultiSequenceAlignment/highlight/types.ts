type HighlightSegment<T> = {
  category: T;
  start: number;
  end: number;
};

export type Highlight<T> = {
  rows?: HighlightSegment<T>[][];
  columns?: HighlightSegment<T>[][];
};

export type SegmentedColumn<T> = HighlightSegment<T>[];
