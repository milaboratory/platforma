import type {
  TxAPI_ClientMessage,
  TxAPI_ServerMessage,
} from "../proto-grpc/github.com/milaboratory/pl/plapi/plapiproto/api";
import type { BiDiStream } from "./abstract_stream";
import Denque from "denque";
import type { Status } from "../proto-grpc/github.com/googleapis/googleapis/google/rpc/status";
import {
  PlErrorCodeNotFound,
  RecoverablePlError,
  rethrowMeaningfulError,
  UnrecoverablePlError,
} from "./errors";
import { StatefulPromise } from "./StatefulPromise";

export type ClientMessageRequest = TxAPI_ClientMessage["request"];

export type ServerMessageResponse = TxAPI_ServerMessage["response"];

type TxStream = BiDiStream<TxAPI_ClientMessage, TxAPI_ServerMessage>;

export type OneOfKind<T extends { oneofKind: unknown }, Kind extends T["oneofKind"]> = Extract<
  T,
  { oneofKind: Kind }
>;

interface SingleResponseHandler {
  mode: "single";
  kind: ServerMessageResponse["oneofKind"];
  resolve: (v: ServerMessageResponse) => void;
  reject: (e: Error) => void;
}

interface MultiResponseHandler {
  mode: "multiBuffered";
  kind: ServerMessageResponse["oneofKind"];
  resolve: (v: ServerMessageResponse[]) => void;
  reject: (e: Error) => void;
}

interface MultiStreamResponseHandler {
  mode: "multiStream";
  kind: ServerMessageResponse["oneofKind"];
  stream: AsyncMessageStream<ServerMessageResponse>;
}

type AnySingleResponseHandler = SingleResponseHandler;
type AnyMultiStreamResponseHandler = MultiStreamResponseHandler;

type AnyResponseHandler =
  | AnySingleResponseHandler
  | MultiResponseHandler
  | AnyMultiStreamResponseHandler;

// Implements both AsyncIterable and AsyncIterator: `[Symbol.asyncIterator]()` returns
// `this`, so multiple `for await` loops over the same stream share state instead of
// creating independent iterators that would race on `waitingResolve`/`waitingReject`.
// Only one active consumer is supported; concurrent `next()` calls are not safe.
class AsyncMessageStream<T> implements AsyncIterable<T>, AsyncIterator<T> {
  private readonly queue = new Denque<T>();
  private done = false;
  private cancelled = false;
  private failure?: Error;
  private waitingResolve?: (value: IteratorResult<T>) => void;
  private waitingReject?: (reason?: unknown) => void;

  public push(value: T): void {
    if (this.done || this.cancelled) return;
    if (this.waitingResolve) {
      const resolve = this.waitingResolve;
      this.waitingResolve = undefined;
      this.waitingReject = undefined;
      resolve({ value, done: false });
      return;
    }
    this.queue.push(value);
  }

  public end(): void {
    if (this.done) return;
    this.done = true;
    if (this.waitingResolve) {
      const resolve = this.waitingResolve;
      this.waitingResolve = undefined;
      this.waitingReject = undefined;
      resolve({ value: undefined, done: true });
    }
  }

  // Fail-fast: any frames still buffered in `this.queue` are intentionally dropped.
  // `next()` checks `this.failure` before draining the queue, so consumers see the
  // error immediately. This differs from `end()`, which drains buffered frames first.
  // Rationale: when the upstream stream errors, the in-flight response is treated as
  // corrupt and partial frames must not be surfaced.
  public fail(error: Error): void {
    if (this.done) return;
    this.failure = error;
    this.done = true;
    if (this.waitingReject) {
      const reject = this.waitingReject;
      this.waitingResolve = undefined;
      this.waitingReject = undefined;
      reject(error);
    }
  }

  public cancel(): void {
    this.cancelled = true;
    this.done = true;
    this.queue.clear();
    if (this.waitingResolve) {
      const resolve = this.waitingResolve;
      this.waitingResolve = undefined;
      this.waitingReject = undefined;
      resolve({ value: undefined, done: true });
    }
  }

  public async next(): Promise<IteratorResult<T>> {
    if (this.failure) throw this.failure;

    const value = this.queue.shift();
    if (value !== undefined) return { value, done: false };

    if (this.done) return { value: undefined, done: true };

    return await new Promise<IteratorResult<T>>((resolve, reject) => {
      this.waitingResolve = resolve;
      this.waitingReject = reject;
    });
  }

  public async return(): Promise<IteratorResult<T>> {
    this.cancel();
    return { value: undefined, done: true };
  }

  public async throw(error?: unknown): Promise<IteratorResult<T>> {
    this.cancel();
    throw error;
  }

  [Symbol.asyncIterator](): this {
    return this;
  }
}

function isRecoverable(status: Status): boolean {
  return status.code === PlErrorCodeNotFound;
}

export class RethrowError extends Error {
  name = "RethrowError";
  constructor(public readonly rethrowLambda: () => never) {
    super("Rethrow error, you should never see this one.");
  }
}

export class LLPlTransaction {
  /** Bidirectional channel through which transaction communicates with the server */
  private readonly stream: TxStream;

  /** Used to abort ongoing transaction stream */
  private readonly abortController = new AbortController();

  /** Counter of sent requests, used to calculate which future response will correspond to this request.
   * Incremented on each sent request. */
  private requestIdxCounter = 0;

  /** Queue from which incoming message processor takes handlers to which pass incoming messages */
  private readonly responseHandlerQueue = new Denque<AnyResponseHandler>();

  /** Each new resource, created by the transaction, is assigned with virtual (local) resource id, to make it possible
   * to populate its fields without awaiting actual resource id. This counter tracks those ids on client side, the
   * same way it is tracked on the server, so client can synchronously return such ids to the user. */
  private localResourceIdCounter = 0n;

  /** Switches to true, when this transaction closes due to normal or exceptional conditions. Prevents any new messages
   * to be sent to the stream. */
  private closed = false;
  /** Whether the outgoing stream was already closed. */
  private completed = false;

  /** If this transaction was terminated due to error, this is a generator to create new errors if corresponding response is required. */
  private errorFactory?: () => never;

  /** Timestamp when transaction was opened */
  private readonly openTimestamp = Date.now();

  private readonly incomingProcessorResult: Promise<(() => never) | null>;

  constructor(streamFactory: (abortSignal: AbortSignal) => TxStream) {
    this.stream = streamFactory(this.abortController.signal);

    // Starting incoming event processor
    this.incomingProcessorResult = this.incomingEventProcessor();
  }

  private assignErrorFactoryIfNotSet(
    errorFactory: () => never,
    reject?: (e: Error) => void,
  ): () => never {
    if (reject !== undefined) reject(new RethrowError(errorFactory));
    if (this.errorFactory) return errorFactory;
    this.errorFactory = errorFactory;
    return errorFactory;
  }

  private async incomingEventProcessor(): Promise<(() => never) | null> {
    /** Counter of received responses, used to check consistency of responses.
     * Increments on each received message. */
    let expectedId = -1;

    // defined externally to make possible to communicate any processing errors
    // to the specific request on which it happened
    let currentHandler: AnyResponseHandler | undefined = undefined;
    let responseAggregator: ServerMessageResponse[] | undefined = undefined;
    let currentMultiIdx = 0;
    try {
      for await (const message of this.stream.responses) {
        if (currentHandler === undefined) {
          currentHandler = this.responseHandlerQueue.shift();

          if (currentHandler === undefined) {
            this.assignErrorFactoryIfNotSet(() => {
              throw new Error(`orphan incoming message`);
            });
            break;
          }

          if (currentHandler.mode === "multiBuffered") responseAggregator = [];
          currentMultiIdx = 0;
          expectedId++;
        }

        if (message.requestId !== expectedId) {
          const errorMessage = `out of order messages, ${message.requestId} !== ${expectedId}`;
          this.assignErrorFactoryIfNotSet(() => {
            throw new Error(errorMessage);
          });
          break;
        }

        if (message.error !== undefined) {
          const status = message.error;

          if (isRecoverable(status)) {
            const recoverableError = new RethrowError(() => {
              throw new RecoverablePlError(status);
            });
            if (currentHandler.mode === "single" || currentHandler.mode === "multiBuffered") {
              currentHandler.reject(recoverableError);
            } else {
              currentHandler.stream.fail(recoverableError);
            }
            currentHandler = undefined;

            if (message.multiMessage !== undefined && !message.multiMessage.isLast) {
              this.assignErrorFactoryIfNotSet(() => {
                throw new Error("Unexpected message sequence.");
              });
              break;
            }

            // We can continue to work after recoverable errors
            continue;
          } else {
            this.assignErrorFactoryIfNotSet(
              () => {
                throw new UnrecoverablePlError(status);
              },
              currentHandler.mode === "single" || currentHandler.mode === "multiBuffered"
                ? currentHandler.reject
                : undefined,
            );
            if (currentHandler.mode === "multiStream") {
              currentHandler.stream.fail(new UnrecoverablePlError(status));
            }
            currentHandler = undefined;

            // In case of unrecoverable errors we close the transaction
            break;
          }
        }

        if (
          currentHandler.kind !== message.response.oneofKind &&
          message?.multiMessage?.isEmpty !== true
        ) {
          const errorMessage = `inconsistent request response types: ${currentHandler.kind} !== ${message.response.oneofKind}`;

          this.assignErrorFactoryIfNotSet(
            () => {
              throw new Error(errorMessage);
            },
            currentHandler.mode === "single" || currentHandler.mode === "multiBuffered"
              ? currentHandler.reject
              : undefined,
          );
          if (currentHandler.mode === "multiStream") {
            currentHandler.stream.fail(new Error(errorMessage));
          }
          currentHandler = undefined;

          break;
        }

        const expectMultiResponse =
          currentHandler.mode === "multiBuffered" || currentHandler.mode === "multiStream";
        if (expectMultiResponse !== (message.multiMessage !== undefined)) {
          const errorMessage = `inconsistent multi state: ${expectMultiResponse} !== ${message.multiMessage !== undefined}`;

          this.assignErrorFactoryIfNotSet(
            () => {
              throw new Error(errorMessage);
            },
            currentHandler.mode === "single" || currentHandler.mode === "multiBuffered"
              ? currentHandler.reject
              : undefined,
          );
          if (currentHandler.mode === "multiStream") {
            currentHandler.stream.fail(new Error(errorMessage));
          }
          currentHandler = undefined;

          break;
        }

        // <- at this point we validated everything we can at this level

        if (message.multiMessage !== undefined) {
          if (!message.multiMessage.isEmpty) {
            if (message.multiMessage.id !== currentMultiIdx + 1) {
              const errorMessage = `inconsistent multi id: ${message.multiMessage.id} !== ${currentMultiIdx + 1}`;

              this.assignErrorFactoryIfNotSet(
                () => {
                  throw new Error(errorMessage);
                },
                currentHandler.mode === "multiBuffered" ? currentHandler.reject : undefined,
              );
              if (currentHandler.mode === "multiStream") {
                currentHandler.stream.fail(new Error(errorMessage));
              }
              currentHandler = undefined;

              break;
            }

            currentMultiIdx++;
            if (currentHandler.mode === "multiBuffered") {
              responseAggregator!.push(message.response);
            } else if (currentHandler.mode === "multiStream") {
              currentHandler.stream.push(message.response);
            }
          }

          if (message.multiMessage.isLast) {
            if (currentHandler.mode === "multiBuffered") {
              currentHandler.resolve(responseAggregator!);
              responseAggregator = undefined;
            } else if (currentHandler.mode === "multiStream") {
              currentHandler.stream.end();
            }
            currentHandler = undefined;
          }
        } else {
          (currentHandler as AnySingleResponseHandler).resolve(message.response);
          currentHandler = undefined;
        }

        // After receiving a terminal response (txCommit or txDiscard), we proactively close the client stream.
        // This ensures consistent behavior between the gRPC and WebSocket transports,
        // since the server closes the connection automatically upon transaction completion in both cases.
        if (this.isTerminalResponse(message) && this.responseHandlerQueue.length === 0) {
          await this.stream.requests.complete();
        }
      }
    } catch (e: any) {
      return this.assignErrorFactoryIfNotSet(
        () => {
          rethrowMeaningfulError(e, true);
        },
        currentHandler &&
          (currentHandler.mode === "single" || currentHandler.mode === "multiBuffered")
          ? currentHandler.reject
          : undefined,
      );
    } finally {
      await this.close();
    }
    return null;
  }

  /** Executed after termination of incoming message processor */
  private async close(): Promise<void> {
    if (this.closed) return;

    this.closed = true;

    // Rejecting all messages

    while (true) {
      const handler = this.responseHandlerQueue.shift();
      if (!handler) break;
      const noReplyError = this.errorFactory
        ? new RethrowError(this.errorFactory)
        : new Error("no reply");
      if (handler.mode === "single" || handler.mode === "multiBuffered") {
        handler.reject(noReplyError);
      } else {
        handler.stream.fail(noReplyError);
      }
    }

    // closing outgoing stream
    await this.stream.requests.complete();
  }

  /** Forcefully close the transaction, terminate all connections and reject all pending requests */
  public abort(cause?: Error) {
    this.assignErrorFactoryIfNotSet(() => {
      throw new Error(`transaction aborted`, { cause });
    });
    this.abortController.abort(cause);
  }

  /** Await incoming message loop termination and throw any leftover errors if it was unsuccessful */
  public async await(): Promise<void> {
    // for those who want to understand "why?":
    // this way there is no hanging promise that will complete with rejection
    // until await is implicitly requested, the this.incomingProcessorResult
    // always resolves with success

    const processingResult = await this.incomingProcessorResult;
    if (processingResult !== null) processingResult();
  }

  public async send<Kind extends ClientMessageRequest["oneofKind"]>(
    r: OneOfKind<ClientMessageRequest, Kind>,
    expectMultiResponse: false,
  ): Promise<OneOfKind<ServerMessageResponse, Kind>>;
  public async send<Kind extends ClientMessageRequest["oneofKind"]>(
    r: OneOfKind<ClientMessageRequest, Kind>,
    expectMultiResponse: true,
  ): Promise<OneOfKind<ServerMessageResponse, Kind>[]>;
  /** Generate proper client message and send it to the server, and returns a promise of future response. */
  public async send<Kind extends ClientMessageRequest["oneofKind"]>(
    r: OneOfKind<ClientMessageRequest, Kind>,
    expectMultiResponse: boolean,
  ): Promise<OneOfKind<ServerMessageResponse, Kind> | OneOfKind<ServerMessageResponse, Kind>[]> {
    if (this.errorFactory) return Promise.reject(new RethrowError(this.errorFactory));

    if (this.closed) return Promise.reject(new Error("Transaction already closed"));

    // Note: Promise synchronously executes a callback passed to a constructor
    const result = StatefulPromise.fromDeferredReject(
      new Promise<
        OneOfKind<ServerMessageResponse, Kind> | OneOfKind<ServerMessageResponse, Kind>[]
      >((resolve, reject) => {
        if (expectMultiResponse) {
          this.responseHandlerQueue.push({
            mode: "multiBuffered",
            kind: r.oneofKind,
            resolve: resolve as (v: ServerMessageResponse[]) => void,
            reject,
          });
        } else {
          this.responseHandlerQueue.push({
            mode: "single",
            kind: r.oneofKind,
            resolve: resolve as (v: ServerMessageResponse) => void,
            reject,
          });
        }
      }),
    );

    // Awaiting message dispatch to catch any associated errors.
    // There is no hurry, we are not going to receive a response until message is sent.
    await this.stream.requests.send({
      requestId: this.requestIdxCounter++,
      request: r,
    });

    try {
      return await result;
    } catch (e: any) {
      if (e instanceof RethrowError) e.rethrowLambda();
      throw new Error("Error while waiting for response", { cause: e });
    }
  }

  public sendStream<Kind extends ClientMessageRequest["oneofKind"]>(
    r: OneOfKind<ClientMessageRequest, Kind>,
  ): AsyncIterable<OneOfKind<ServerMessageResponse, Kind>> {
    if (this.errorFactory) throw new RethrowError(this.errorFactory);
    if (this.closed) throw new Error("Transaction already closed");

    const stream = new AsyncMessageStream<ServerMessageResponse>();
    this.responseHandlerQueue.push({ mode: "multiStream", kind: r.oneofKind, stream });

    void this.stream.requests
      .send({ requestId: this.requestIdxCounter++, request: r })
      .catch((e: unknown) => {
        if (e instanceof Error) stream.fail(e);
        else stream.fail(new Error("Error while sending request", { cause: e }));
      });

    return stream as AsyncIterable<OneOfKind<ServerMessageResponse, Kind>>;
  }

  private _completed = false;

  /** Safe to call multiple times */
  public async complete() {
    if (this._completed) return;
    this._completed = true;
    await this.stream.requests.complete();
  }

  private isTerminalResponse(message: TxAPI_ServerMessage): boolean {
    const kind = message.response.oneofKind;
    return kind === "txCommit" || kind === "txDiscard";
  }
}
