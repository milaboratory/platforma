import type {
  ReadCsvStep,
  ReadNdjsonStep,
  WriteCsvStep,
  WriteNdjsonStep,
  BaseFileReadStep,
  BaseFileWriteStep,
  WriteParquetStep,
  ReadParquetStep,
} from './io';
import type {
  AddColumnsStep,
  FilterStep,
  LimitStep,
  SelectStep,
  UniqueKeepStrategy,
  UniqueStep,
  WithColumnsStep,
  WithoutColumnsStep,
} from './basic_steps';
import type { AggregateStep } from './aggregate';
import type { AnyJoinStep } from './join';
import type { ConcatenateStep } from './concatenate';
import type { SortStep } from './sort';
import type { WriteFrameStep } from './write_frame';
import type { ReadFrameStep } from './read_frame';

export type PTablerStep =
  | ReadCsvStep
  | ReadNdjsonStep
  | ReadParquetStep
  | WriteCsvStep
  | WriteNdjsonStep
  | WriteParquetStep
  | AddColumnsStep
  | FilterStep
  | LimitStep
  | AggregateStep
  | AnyJoinStep
  | ConcatenateStep
  | SortStep
  | SelectStep
  | UniqueStep
  | WithColumnsStep
  | WithoutColumnsStep
  | WriteFrameStep
  | ReadFrameStep;

export type PTablerWorkflow = {
  workflow: PTablerStep[];
};

// Re-export base interfaces for potential external use
export type {
  AddColumnsStep, AggregateStep,
  AnyJoinStep, BaseFileReadStep,
  BaseFileWriteStep, ConcatenateStep, FilterStep, ReadCsvStep,
  ReadNdjsonStep, SelectStep, SortStep, UniqueKeepStrategy, UniqueStep,
  WithColumnsStep, WithoutColumnsStep, WriteCsvStep,
  WriteNdjsonStep,
};

// Re-export expression types for external use
export type * from './expressions';
