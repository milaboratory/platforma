/**
 * File filter passed to the native save dialog. Matches Electron's
 * `FileFilter` shape so desktop runtimes can forward it verbatim.
 */
export interface FileFilter {
  name: string;
  extensions: string[];
}

/**
 * Options accepted by `Dialog.showSaveDialog`. The UI supplies only a
 * default file name; the main-process handler decides the default
 * directory (e.g. `~/Downloads`).
 */
export interface ShowSaveDialogOptions {
  defaultFileName?: string;
  filters?: FileFilter[];
  title?: string;
}

/** Result of `Dialog.showSaveDialog`. */
export interface ShowSaveDialogResult {
  canceled: boolean;
  path?: string;
}

/**
 * UI-facing save-dialog service. Implemented by desktop runtimes that
 * can open a native file picker; absent in web/preview environments.
 */
export interface DialogService {
  showSaveDialog(options: ShowSaveDialogOptions): Promise<ShowSaveDialogResult>;
}
