export type PlProgressCellProps = {
  stage: 'not_started' | 'running' | 'done';
  step?: string; // "Alignment" / "Queued" (main left text)
  progressString?: string; // "20%" or "2 / 4" (right text)
  progress?: number; // Percent value! (from 0 to 100) i.e. 20 for 20%; 'undefined' for unknown progress = animated progressbar
  error?: string;
};
