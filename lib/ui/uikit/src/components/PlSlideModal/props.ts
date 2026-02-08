export type Props = {
  /**
   * Determines whether the modal is open
   */
  modelValue: boolean;
  /**
   * Css `width` value (px, %, em etc)
   */
  width?: string;
  /**
   * If `true`, then show shadow (default value `false`)
   */
  shadow?: boolean;
  /**
   * If `true`, the modal window closes when clicking outside the modal area (default: `true`)
   */
  closeOnOutsideClick?: boolean;
};

export const defaultProps: Props = {
  modelValue: false,
  width: "368px",
  shadow: false,
  closeOnOutsideClick: true,
};
