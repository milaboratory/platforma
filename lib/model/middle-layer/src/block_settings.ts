/**
 * What part of block version should be locked against updates.
 * 
 *   - `major` - 1.2.3 can be updated to 1.4.7
 *   - `minor` - 1.2.3 can be updated to 1.2.5
 *   - `patch` - version of the block is completely locked
 * 
 * */
export type VersionLock = 'major' | 'minor' | 'patch';

/**
 * Block settings, persisted on the backend.
 *
 * Settings modulate different aspects of block behaviour,
 * currently only updates.
 * */
export type BlockSettings = {
  /** Only version stricktly greater that this one will be suggested for auto-update. */
  skipVersion?: string;
  /**
   * If certain version locking policy is set, auto-updates will only be suggested,
   * if there is an update within the specified release line.
   * */
  versionLock?: VersionLock;
};
