/** Divides all configurations into two broad classes. Some configs can be
 * executed synchronously, given all their arguments are already rendered.
 * Some require creation of a separate rendering cell, like downloading
 * files. */
export type CfgRenderingMode = 'Sync' | 'Async';
