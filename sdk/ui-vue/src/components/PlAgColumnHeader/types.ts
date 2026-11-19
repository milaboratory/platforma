export type PlAgHeaderComponentType = "Text" | "Number" | "File" | "Date" | "Duration" | "Progress";

export type PlAgHeaderComponentParams = {
  type?: PlAgHeaderComponentType;
  tooltip?: string;
  info?: string;
  /** Link icon hover text, for a column reached through a peer link. */
  linkHint?: string;
};
