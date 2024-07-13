/** Any object exported into the result pool by the block always have spec attached to it */
export interface PObjectSpec {
  /** BObject kind discriminator */
  readonly kind: string;

  /** additional information attached to the object that does not affect its
   * identifier */
  readonly annotations?: Record<string, string>;
}
