/** Block section visualized as items in left panel block overview */
export type BlockSection = BlockSectionLink | BlockSectionDelimiter;

/** Tells the system that specific section from the main UI of this block should
 * be opened */
export type BlockSectionLink = {
  /** Potentially there may be multiple section types, i.e. for "+" rows and for
   * sections directly opening html from the outputs. */
  readonly type: 'link';

  /** Internal block section identifier */
  readonly href: `/${string}`;

  /** Link visual appearance */
  readonly appearance?: BlockSectionLinkAppearance;

  /** Visible section title, can also be used in the window header. */
  readonly label: string;
};

/** Different variants for link section appearance */
export type BlockSectionLinkAppearance = 
  /** Shows a section of type `link` with a `+` icon and a certain specific style */
  'add-section';

/** Create a horizontal line between sections */
export type BlockSectionDelimiter = {
  readonly type: 'delimiter';
};

/**
 * Part of the block state, representing current navigation information
 * (i.e. currently selected section)
 * */
export type NavigationState<Href extends `/${string}` = `/${string}`> = {
  readonly href: Href;
};

export const DefaultNavigationState: NavigationState = { href: '/' };
