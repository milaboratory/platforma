import type { GridApi, IRowNode } from "ag-grid-enterprise";
import { Deferred } from "@milaboratories/helpers";

class DeferredTracked<T> extends Deferred<T> {
  #resolved = false;

  constructor() {
    super();
    this.promise.finally(() => {
      this.#resolved = true;
    });
  }

  public get resolved(): boolean {
    return this.#resolved;
  }
}

export class DeferredCircular<T> {
  private deferred = new DeferredTracked<T>();

  public get promise(): Promise<T> {
    return this.deferred.promise;
  }

  public resolve(ctx: T): void {
    this.deferred.resolve(ctx);
  }

  public get resolved(): boolean {
    return this.deferred.resolved;
  }

  public reset(): void {
    if (this.resolved) {
      this.deferred = new DeferredTracked<T>();
    }
  }
}

export function ensureNodeVisible<TData>(
  api: GridApi<TData>,
  selector: (row: IRowNode<TData>) => boolean,
): boolean {
  let rowIndex: number | null = null;
  const nodeSelector = (row: IRowNode<TData>): boolean => {
    if (selector(row)) {
      rowIndex = row.rowIndex;
      return true;
    }
    return false;
  };
  api.ensureNodeVisible(nodeSelector, "middle");
  if (rowIndex) {
    const columns = api.getAllDisplayedColumns();
    if (columns.length > 0) {
      api.ensureColumnVisible(columns[0]);
      api.setFocusedCell(rowIndex, columns[0]);
    }
  }
  return rowIndex !== null;
}
