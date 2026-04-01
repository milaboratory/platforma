import { EventEmitter } from "node:events";
import type { MiLoggerLevel } from "@milaboratories/helpers";

// Re-export logger types from @milaboratories/helpers for backwards compatibility
export type { MiLogger, MiLoggerLevel, MiLoggerLogEvent } from "@milaboratories/helpers";
export { ConsoleLoggerAdapter } from "@milaboratories/helpers";

export type BlockEventDispatcherEvent = {
  type: "log";
  blockId: string;
  level: MiLoggerLevel;
  message: string;
};

export class BlockEventDispatcher extends EventEmitter<{
  [key: string]: [BlockEventDispatcherEvent];
}> {
  constructor() {
    super();
  }

  private eventKey(blockId: string): string {
    return `${blockId}`;
  }

  public logInfo(blockId: string, message: string): void {
    this.emit(this.eventKey(blockId), { type: "log", blockId, level: "info", message });
  }

  public logWarn(blockId: string, message: string): void {
    this.emit(this.eventKey(blockId), { type: "log", blockId, level: "warn", message });
  }

  public logError(blockId: string, message: string): void {
    this.emit(this.eventKey(blockId), { type: "log", blockId, level: "error", message });
  }

  public onBlockEvent(
    blockId: string,
    callback: (event: BlockEventDispatcherEvent) => void,
  ): () => void {
    this.on(this.eventKey(blockId), callback);
    return () => this.off(this.eventKey(blockId), callback);
  }

  public removeAllBlockListeners(blockId: string): void {
    this.removeAllListeners(this.eventKey(blockId));
  }
}
