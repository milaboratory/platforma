/** Block section visualized as items in left panel block overview */
export type BlockSection = BlockSectionMain

/** Tells the system that specific section from the main UI of this block should
 * be opened */
export type BlockSectionMain = {
  /** Potentially there may be multiple section types, i.e. for "+" rows and for
   * sections directly opening html from the outputs. */
  readonly type: 'main'

  /** Internal block section identifier */
  readonly section: string,

  /** Visible section title, can also be used in the window header. */
  readonly title: string
}
