/** Structure to help resolve conflicts if multiple participants writes to
 * the same state */
export interface AuthorMarker {
  /** Unique identifier of client or even a specific window that sets this
   * particular state */
  authorId: string;

  /** Sequential version of the state local to the author */
  localVersion: number;
}
