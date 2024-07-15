/** Block section visualized as items in left panel block overview */
export type BlockSection = BlockSectionLink | BlockSectionDelimiter;

/** Tells the system that specific section from the main UI of this block should
 * be opened */
export type BlockSectionLink = {
  /** Potentially there may be multiple section types, i.e. for "+" rows and for
   * sections directly opening html from the outputs. */
  readonly type: 'link';

  /** Internal block section identifier */
  readonly href: string;

  /** Visible section title, can also be used in the window header. */
  readonly label: string;
};

/** Create a horisontal line between sections */
export type BlockSectionDelimiter = {
  readonly type: 'delimiter';
};
