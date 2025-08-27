import type { AggregateStep } from './aggregate';
import type { AddColumnsStep, FilterStep, SelectStep, WithColumnsStep, WithoutColumnsStep } from './basic_steps';
import type { ConcatenateStep } from './concatenate';
import type { BaseFileReadStep, BaseFileWriteStep, ReadCsvStep, ReadNdjsonStep, WriteCsvStep, WriteNdjsonStep } from './io';
import type { AnyJoinStep } from './join';
import type { SortStep } from './sort';

export type PTablerStep =
  | ReadCsvStep
  | ReadNdjsonStep
  | WriteCsvStep
  | WriteNdjsonStep
  | AddColumnsStep
  | FilterStep
  | AggregateStep
  | AnyJoinStep
  | ConcatenateStep
  | SortStep
  | SelectStep
  | WithColumnsStep
  | WithoutColumnsStep;

export type PTablerWorkflow = {
  workflow: PTablerStep[];
};

// Re-export base interfaces for potential external use
export type {
  AddColumnsStep, AggregateStep,
  AnyJoinStep, BaseFileReadStep,
  BaseFileWriteStep, ConcatenateStep, FilterStep, ReadCsvStep,
  ReadNdjsonStep, SelectStep, SortStep, WithColumnsStep,
  WithoutColumnsStep, WriteCsvStep,
  WriteNdjsonStep,
};

// Re-export expression types for external use
export type * from './expressions';
