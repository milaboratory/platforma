/** Generic settings for drivers that perform polling */
export type PollingOps = {
  /** How frequent the driver should update exposed states from the backend. */
  pollingInterval: number;
  /** For how long to continue polling after the last derived computable value access. */
  stopPollingDelay: number;
};
