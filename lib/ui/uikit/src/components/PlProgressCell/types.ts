export type PlProgressCellProps = {
  stage: 'not_started' | 'running' | 'done';
  step: string; // "Alignment" / "Queued"
  progressString: string; // "20%" or "2 / 4"
  progress?: number; // i.e. 0.2 for 20%; 'undefined' for unknown progress = animated progressbar
  error?: string;
};
