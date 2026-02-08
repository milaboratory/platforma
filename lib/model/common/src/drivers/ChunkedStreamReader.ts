import type { RangeBytes } from "./blob";

/**
 * Status returned by onError handler to indicate what action to take
 * - 'continue': Retry the failed operation
 * - 'error': Error the stream (calls controller.error, aborts ongoing fetches)
 * - 'cancel': Cancel the stream gracefully (calls controller.close, aborts ongoing fetches)
 */
export type ErrorHandlerStatus = "continue" | "error" | "cancel";

/**
 * Options for creating a ChunkedStreamReader
 */
export interface ChunkedStreamReaderOptions {
  /**
   * Function to fetch a chunk of data. Optionally accepts an AbortSignal to cancel the fetch.
   */
  fetchChunk: (range: RangeBytes, signal?: AbortSignal) => Promise<Uint8Array>;

  /**
   * Total size of the blob in bytes
   */
  totalSize: number;

  /**
   * Size of each chunk to read in bytes (default: 16MB)
   */
  chunkSize?: number;

  /**
   * Error handler callback. Called when an error occurs during chunk fetching.
   * Should return:
   * - 'continue' to retry the operation
   * - 'error' to error the stream (will call controller.error and abort ongoing fetches)
   * - 'cancel' to cancel gracefully (will call controller.close and abort ongoing fetches)
   * Default behavior: returns 'error'.
   */
  onError?: (error: unknown) => Promise<ErrorHandlerStatus>;
}

/**
 * ChunkedStreamReader creates a ReadableStream that reads data from a blob driver
 * in fixed-size chunks. This is useful for streaming large files without loading
 * them entirely into memory.
 */
export class ChunkedStreamReader {
  private currentPosition: number = 0;
  private _read = true;
  private _canceled = false;
  private _errored = false;
  private abortController: AbortController | null = null;
  private readonly options: Required<ChunkedStreamReaderOptions>;

  /**
   * Creates a new ChunkedStreamReader instance.
   * Use the static `create` method instead.
   */
  private constructor(options: ChunkedStreamReaderOptions) {
    // Normalize options with defaults
    this.options = {
      ...options,
      chunkSize: options.chunkSize ?? 16 * 1024 * 1024,
      onError:
        options.onError ??
        (async () => {
          // Default behavior: error (will automatically call controller.error)
          return "error";
        }),
    };

    if (this.totalSize < 0) {
      throw new Error("Total size must be non-negative");
    }
    if (this.chunkSize <= 0) {
      throw new Error("Chunk size must be positive");
    }
  }

  /**
   * Gets the fetchChunk function from options
   */
  private get fetchChunk() {
    return this.options.fetchChunk;
  }

  /**
   * Gets the total size from options
   */
  private get totalSize() {
    return this.options.totalSize;
  }

  /**
   * Gets the chunk size from options
   */
  private get chunkSize() {
    return this.options.chunkSize;
  }

  /**
   * Gets the onError callback from options
   */
  private get onError() {
    return this.options.onError;
  }

  /**
   * Creates and returns a ReadableStream that reads data in chunks.
   *
   * @param options - Configuration options for the chunked stream reader
   * @returns ReadableStream that can be consumed by zip.add or other stream consumers
   *
   * @example
   * ```typescript
   * const stream = ChunkedStreamReader.create({
   *   fetchChunk: async (range, signal) => {
   *     const response = await fetch(`/api/data?from=${range.from}&to=${range.to}`, { signal });
   *     return new Uint8Array(await response.arrayBuffer());
   *   },
   *   totalSize: 1024 * 1024, // 1MB
   *   chunkSize: 64 * 1024,   // 64KB chunks
   * });
   * ```
   */
  static create(options: ChunkedStreamReaderOptions): ReadableStream<Uint8Array> {
    const reader = new ChunkedStreamReader(options);
    return reader.createStream();
  }

  private readStart() {
    this._read = true;
  }

  private readStop() {
    this._read = false;
  }

  private async tryRead(controller: ReadableStreamDefaultController<Uint8Array>): Promise<boolean> {
    if (this._canceled) {
      return true;
    }

    // Check if we've read all data
    if (this.isComplete()) {
      controller.close();
      return true;
    }

    try {
      // Calculate the end position for this chunk
      // Ensure we don't read beyond the total size
      const endPosition = Math.min(this.currentPosition + this.chunkSize, this.totalSize);

      // Fetch the chunk from the blob driver, passing the abort signal if available
      const data = await this.fetchChunk(
        { from: this.currentPosition, to: endPosition },
        this.abortController?.signal,
      );

      // Check if stream was cancelled during the fetch
      if (this._canceled) {
        return true;
      }

      // Enqueue the data into the stream
      controller.enqueue(data);

      // Update the current position for the next chunk
      this.currentPosition = endPosition;

      if (!controller.desiredSize || controller.desiredSize <= 0) {
        // The internal queue is full, so propagate
        // the backpressure signal to the underlying source.
        this.readStop();
      }
    } catch (error) {
      // If any error occurs during chunk reading, call the error handler
      const status = await this.onError(error);

      if (status === "error") {
        this._errored = true;
        // Error the stream and abort any ongoing fetch operations
        controller.error(error);
        this.abortController?.abort("Stream errored");
        return true; // Stop reading
      }

      if (status === "cancel") {
        this._canceled = true;
        // Close the stream gracefully and abort any ongoing fetch operations
        controller.close();
        this.abortController?.abort("Stream cancelled");
        console.debug("ChunkedStreamReader cancelled due to error");
        return true; // Stop reading
      }
    }

    return false;
  }

  /**
   * Creates and returns a ReadableStream that reads data in chunks.
   * The stream will automatically close when all data has been read.
   *
   * @private - Use the static `create` method instead
   * @returns ReadableStream that can be consumed by zip.add or other stream consumers
   */
  private createStream(): ReadableStream<Uint8Array> {
    // Create an AbortController for this stream
    this.abortController = new AbortController();

    return new ReadableStream({
      start: async (controller) => {
        while (true) {
          if (this._canceled || this._errored) {
            return;
          }

          if (!this._read) {
            await new Promise((r) => setTimeout(r, 0));
            if (controller.desiredSize) {
              this.readStart();
            }
          } else {
            const isDone = await this.tryRead(controller);
            if (isDone) {
              return;
            }
          }
        }
      },

      pull: () => {
        this.readStart();
      },

      cancel: (reason) => {
        this._canceled = true;
        // Abort any ongoing fetch operations
        this.abortController?.abort(reason);
        console.debug("ChunkedStreamReader cancelled:", reason);
      },
    });
  }

  /**
   * Gets the current reading position in bytes.
   *
   * @returns Current position as number of bytes read
   */
  getCurrentPosition(): number {
    return this.currentPosition;
  }

  /**
   * Gets the remaining bytes to be read.
   *
   * @returns Number of bytes remaining
   */
  getRemainingBytes(): number {
    return Math.max(0, this.totalSize - this.currentPosition);
  }

  /**
   * Checks if the entire blob has been read.
   *
   * @returns True if all data has been read
   */
  isComplete(): boolean {
    return this.currentPosition >= this.totalSize;
  }
}
