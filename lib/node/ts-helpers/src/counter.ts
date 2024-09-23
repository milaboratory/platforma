/** It's just a set of callerIds that are interested in one value. */
export class CallersCounter {
  private callers: Set<string> = new Set();

  public isZero(): boolean {
    return this.callers.size == 0;
  }

  public inc(callerId: string): boolean {
    const created = this.callers.size == 0;
    this.callers.add(callerId);
    return created;
  }

  public dec(callerId: string): boolean {
    this.callers.delete(callerId);
    return this.callers.size == 0;
  }
}
