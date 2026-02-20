export type TabOption<T extends string = string> = {
  label: string;
  value: T;
  /**
   * Each option can be disabled
   */
  disabled?: boolean;
  /**
   * Maximum tab width (css value)
   */
  maxWidth?: string;
};
