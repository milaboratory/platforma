import {
  TxAPI_ClientMessage,
  TxAPI_ServerMessage
} from '../proto/github.com/milaboratory/pl/plapi/plapiproto/api';
import { DuplexStreamingCall } from '@protobuf-ts/runtime-rpc';
import Denque from 'denque';
import { Status } from '../proto/github.com/googleapis/googleapis/google/rpc/status';
import {
  PlErrorCodeNotFound,
  RecoverablePlError,
  rethrowMeaningfulError,
  UnrecoverablePlError
} from './errors';

export type ClientMessageRequest = TxAPI_ClientMessage['request'];

export type ServerMessageResponse = TxAPI_ServerMessage['response'];

type TxStream = DuplexStreamingCall<TxAPI_ClientMessage, TxAPI_ServerMessage>;

export type OneOfKind<T extends { oneofKind: unknown }, Kind extends T['oneofKind']> = Extract<
  T,
  { oneofKind: Kind }
>;

interface SingleResponseHandler<Kind extends ServerMessageResponse['oneofKind']> {
  kind: Kind;
  expectMultiResponse: false;
  resolve: (v: OneOfKind<ServerMessageResponse, Kind>) => void;
  reject: (e: Error) => void;
}

interface MultiResponseHandler<Kind extends ServerMessageResponse['oneofKind']> {
  kind: Kind;
  expectMultiResponse: true;
  resolve: (v: OneOfKind<ServerMessageResponse, Kind>[]) => void;
  reject: (e: Error) => void;
}

type AnySingleResponseHandler = SingleResponseHandler<ServerMessageResponse['oneofKind']>;

type AnyMultiResponseHandler = MultiResponseHandler<ServerMessageResponse['oneofKind']>;

type AnyResponseHandler =
  | SingleResponseHandler<ServerMessageResponse['oneofKind']>
  | MultiResponseHandler<ServerMessageResponse['oneofKind']>;

function createResponseHandler<Kind extends ServerMessageResponse['oneofKind']>(
  kind: Kind,
  expectMultiResponse: boolean,
  resolve:
    | ((v: OneOfKind<ServerMessageResponse, Kind>) => void)
    | ((v: OneOfKind<ServerMessageResponse, Kind>[]) => void),
  reject: (e: Error) => void
): AnyResponseHandler {
  return { kind, expectMultiResponse, resolve, reject } as AnyResponseHandler;
}

function isRecoverable(status: Status): boolean {
  return status.code === PlErrorCodeNotFound;
}

export class RethrowError extends Error {
  constructor(public readonly rethrowLambda: () => never) {
    super('Rethrow error, you should never see this one.');
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
    reject?: (e: Error) => void
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

          // allocating response aggregator array
          if (currentHandler.expectMultiResponse) responseAggregator = [];

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
            currentHandler.reject(
              new RethrowError(() => {
                throw new RecoverablePlError(status);
              })
            );
            currentHandler = undefined;

            if (message.multiMessage !== undefined && !message.multiMessage.isLast) {
              this.assignErrorFactoryIfNotSet(() => {
                throw new Error('Unexpected message sequence.');
              });
              break;
            }

            // We can continue to work after recoverable errors
            continue;
          } else {
            this.assignErrorFactoryIfNotSet(() => {
              throw new UnrecoverablePlError(status);
            }, currentHandler.reject);
            currentHandler = undefined;

            // In case of unrecoverable errors we close the transaction
            break;
          }
        }

        if (
          currentHandler!.kind !== message.response.oneofKind &&
          message?.multiMessage?.isEmpty !== true
        ) {
          const errorMessage = `inconsistent request response types: ${currentHandler!.kind} !== ${message.response.oneofKind}`;

          this.assignErrorFactoryIfNotSet(() => {
            throw new Error(errorMessage);
          }, currentHandler.reject);
          currentHandler = undefined;

          break;
        }

        if (currentHandler!.expectMultiResponse !== (message.multiMessage !== undefined)) {
          const errorMessage = `inconsistent multi state: ${currentHandler!.expectMultiResponse} !== ${message.multiMessage !== undefined}`;

          this.assignErrorFactoryIfNotSet(() => {
            throw new Error(errorMessage);
          }, currentHandler.reject);
          currentHandler = undefined;

          break;
        }

        // <- at this point we validated everything we can at this level

        if (message.multiMessage !== undefined) {
          if (!message.multiMessage.isEmpty) {
            if (message.multiMessage.id !== responseAggregator!.length + 1) {
              const errorMessage = `inconsistent multi id: ${message.multiMessage.id} !== ${responseAggregator!.length + 1}`;

              this.assignErrorFactoryIfNotSet(() => {
                throw new Error(errorMessage);
              }, currentHandler.reject);
              currentHandler = undefined;

              break;
            }

            responseAggregator!.push(message.response);
          }

          if (message.multiMessage.isLast) {
            (currentHandler as AnyMultiResponseHandler).resolve(responseAggregator!);
            responseAggregator = undefined;
            currentHandler = undefined;
          }
        } else {
          (currentHandler as AnySingleResponseHandler).resolve(message.response);
          currentHandler = undefined;
        }
      }
    } catch (e: any) {
      return this.assignErrorFactoryIfNotSet(() => {
        rethrowMeaningfulError(e, true);
      }, currentHandler?.reject);
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
    let handler: AnyResponseHandler | undefined = undefined;
    while (true) {
      const handler = this.responseHandlerQueue.shift();
      if (!handler) break;
      if (this.errorFactory) handler.reject(new RethrowError(this.errorFactory));
      else handler.reject(new Error('no reply'));
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

  public async send<Kind extends ClientMessageRequest['oneofKind']>(
    r: OneOfKind<ClientMessageRequest, Kind>,
    expectMultiResponse: false
  ): Promise<OneOfKind<ServerMessageResponse, Kind>>;
  public async send<Kind extends ClientMessageRequest['oneofKind']>(
    r: OneOfKind<ClientMessageRequest, Kind>,
    expectMultiResponse: true
  ): Promise<OneOfKind<ServerMessageResponse, Kind>[]>;
  /** Generate proper client message and send it to the server, and returns a promise of future response. */
  public async send<Kind extends ClientMessageRequest['oneofKind']>(
    r: OneOfKind<ClientMessageRequest, Kind>,
    expectMultiResponse: boolean
  ): Promise<OneOfKind<ServerMessageResponse, Kind> | OneOfKind<ServerMessageResponse, Kind>[]> {
    if (this.errorFactory) return Promise.reject(new RethrowError(this.errorFactory));

    if (this.closed) return Promise.reject(new Error('Transaction already closed'));

    // Note: Promise synchronously executes a callback passed to a constructor
    const result = new Promise<OneOfKind<ServerMessageResponse, Kind>>((resolve, reject) => {
      this.responseHandlerQueue.push(
        createResponseHandler(r.oneofKind, expectMultiResponse, resolve, reject)
      );
    });

    // Awaiting message dispatch to catch any associated errors.
    // There is no hurry, we are not going to receive a response until message is sent.
    await this.stream.requests.send({
      requestId: this.requestIdxCounter++,
      request: r
    });

    try {
      return await result;
    } catch (e: any) {
      if (e instanceof RethrowError) e.rethrowLambda();
      throw new Error('Error while waiting for response', { cause: e });
    }
  }

  private _completed = false;

  /** Safe to call multiple times */
  public async complete() {
    if (this._completed) return;
    this._completed = true;
    await this.stream.requests.complete();
  }
}
