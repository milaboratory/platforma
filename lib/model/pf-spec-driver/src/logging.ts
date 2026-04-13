const LogPFrames = Boolean(process.env.MI_LOG_PFRAMES);

export function logPFrames(): boolean {
  return LogPFrames;
}
