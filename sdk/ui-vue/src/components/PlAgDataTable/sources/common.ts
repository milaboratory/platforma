export const PTableHidden = { type: "hidden" } as const;
export type PTableHidden = typeof PTableHidden;

export function isPTableHidden(value: unknown): value is PTableHidden {
  return typeof value === "object" && value !== null && "type" in value && value.type === "hidden";
}
