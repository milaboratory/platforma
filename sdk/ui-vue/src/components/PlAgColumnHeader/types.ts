export type PlAgHeaderComponentType = "Text" | "Number" | "File" | "Date" | "Duration" | "Progress";

export type PlAgHeaderComponentParams = {
  type?: PlAgHeaderComponentType;
  tooltip?: string;
  info?: string;
  /** Peer links that reached the column; the header marks it with a link icon. */
  peerLinks?: string[];
};
