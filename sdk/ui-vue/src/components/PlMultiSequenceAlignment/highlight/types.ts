type ColumnSegment<T> = {
  category: T;
  start: number;
  end: number;
};

export type SegmentedColumn<T> = ColumnSegment<T>[];
