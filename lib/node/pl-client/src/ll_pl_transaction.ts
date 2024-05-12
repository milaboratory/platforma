import { TxAPI_ClientMessage, TxAPI_ServerMessage } from './proto/github.com/milaboratory/pl/plapi/plapiproto/api';
import { DuplexStreamingCall } from '@protobuf-ts/runtime-rpc';
import Denque from 'denque';
import { Status } from './proto/github.com/googleapis/googleapis/google/rpc/status';
import { NonUndefined, Optional } from 'utility-types';

type ClientMessageRequest = TxAPI_ClientMessage['request'];

type ServerMessageResponse = TxAPI_ServerMessage['response'];

type TxStream = DuplexStreamingCall<TxAPI_ClientMessage, TxAPI_ServerMessage>;

// export type OneOfKind<T extends { oneofKind: unknown },
//   Kind extends T['oneofKind'] & string> = Extract<T, { [K in Kind]: any }>;

export type OneOfKind<
  T extends { oneofKind: unknown },
  Kind extends T['oneofKind']>
  = Extract<T, { oneofKind: Kind }>;

interface ResponseHandler<Kind extends ServerMessageResponse['oneofKind']> {
  kind: Kind;
  resolve: (v: OneOfKind<ServerMessageResponse, Kind>) => void;
  reject: (e: Error) => void;
}

type AnyResponseHandler = ResponseHandler<ServerMessageResponse['oneofKind']>

function createResponseHandler<Kind extends ServerMessageResponse['oneofKind']>(
  kind: Kind,
  resolve: (v: OneOfKind<ServerMessageResponse, Kind>) => void,
  reject: (e: Error) => void
): AnyResponseHandler {
  return { kind, resolve, reject } as AnyResponseHandler;
}

export class PlError extends Error {
  constructor(status: Status) {
    super(status.message);
  }
}

export class RecoverablePlError extends PlError {
  constructor(status: Status) {
    super(status);
  }
}

export class UnrecoverablePlError extends PlError {
  constructor(status: Status) {
    super(status);
  }
}

function wrapPlError(status: Status): PlError {
  if ('1' === '1')
    throw new Error('asd');
  return new UnrecoverablePlError(status);
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
  private errorFactory?: () => Error;

  /** Timestamp when transaction was opened */
  private readonly openTimestamp = Date.now();

  private readonly incomingProcessorResult: Promise<void>;

  constructor(streamFactory: (abortSignal: AbortSignal) => TxStream) {
    this.stream = streamFactory(this.abortController.signal);

    // Starting incoming event processor
    this.incomingProcessorResult = this.incomingEventProcessor();
  }

  private assignErrorFactoryIfNotSet(errorFactory: () => Error) {
    if (this.errorFactory)
      return;
    this.errorFactory = errorFactory;
  }

  private assignClosedTransactionErrorIfNotSet(cause: Error) {
    // this.assignErrorFactoryIfNotSet(() => cause);
    this.assignErrorFactoryIfNotSet(() => new Error(`closed transaction because of: ${cause.message}`, { cause: cause }));
  }

  private async incomingEventProcessor(): Promise<void> {
    /** Counter of received responses, used to check consistency of responses.
     * Increments on each received message. */
    let responseIdxCounter = 0;

    // defined externally to make possible to communicate any processing errors
    // to the specific request on which it happened
    let currentHandler: AnyResponseHandler | undefined = undefined;
    try {
      for await (const message of this.stream.responses) {
        const expectedId = responseIdxCounter++;
        if (message.requestId !== expectedId) {
          this.assignErrorFactoryIfNotSet(
            () => new Error(`out of order messages, ${message.requestId} !== ${expectedId}`)
          );
          break;
        }

        currentHandler = this.responseHandlerQueue.shift();

        if (currentHandler === undefined) {
          this.assignErrorFactoryIfNotSet(
            () => new Error(`orphan incoming message`)
          );
          break;
        }

        if (message.error !== undefined) {
          const currentError = wrapPlError(message.error);
          currentHandler.reject(currentError);
          currentHandler = undefined;

          if (currentError instanceof UnrecoverablePlError) {
            // In case of unrecoverable errors we close the transaction
            this.assignClosedTransactionErrorIfNotSet(currentError);
            break;
          }

          // We can continue to work after recoverable errors
          continue;
        }

        if (currentHandler.kind !== message.response.oneofKind) {
          const currentError = new Error(
            `inconsistent request response types: ${currentHandler.kind} !== ${message.response.oneofKind}`
          );
          currentHandler.reject(currentError);
          currentHandler = undefined;

          this.assignClosedTransactionErrorIfNotSet(currentError);

          break;
        }

        // <- at this point we validated everything we can at this level

        currentHandler.resolve(message.response);
        currentHandler = undefined;
      }
    } catch (e: unknown) {
      const error = e instanceof Error ? e : new Error('error');
      // noinspection PointlessBooleanExpressionJS
      if (currentHandler !== undefined) {
        // noinspection JSObjectNullOrUndefined
        currentHandler.reject(error);
      }
      this.assignClosedTransactionErrorIfNotSet(error);
    } finally {
      await this.close();
    }
  }

  /** Executed after termination of incoming message processor */
  private async close(): Promise<void> {
    if (this.closed)
      return;

    this.closed = true;

    // Rejecting all messages
    let handler: AnyResponseHandler | undefined = undefined;
    while (true) {
      const handler = this.responseHandlerQueue.shift();
      if (!handler)
        break;
      if (this.errorFactory)
        handler.reject(this.errorFactory());
      else
        handler.reject(new Error('no reply'));
    }

    // closing outgoing stream
    await this.stream.requests.complete();
  }

  /** Forcefully close the transaction, terminate all connections and reject all pending requests */
  public abort(cause?: Error) {
    this.assignErrorFactoryIfNotSet(() => new Error(`transaction aborted`, { cause }));
    this.abortController.abort(cause);
  }

  public await(): Promise<void> {
    return this.incomingProcessorResult;
  }

  /** Generate proper client message and send it to the server, and returns a promise of future response. */
  public async send<Kind extends ClientMessageRequest['oneofKind']>(
    r: OneOfKind<ClientMessageRequest, Kind>
  ): Promise<OneOfKind<ServerMessageResponse, Kind>> {
    if (this.errorFactory)
      return Promise.reject(this.errorFactory());

    if (this.closed)
      return Promise.reject(new Error('Transaction already closed'));

    // Note: Promise synchronously executes a callback passed to a constructor
    const result = new Promise<OneOfKind<ServerMessageResponse, Kind>>((resolve, reject) => {
      this.responseHandlerQueue.push(createResponseHandler(
        r.oneofKind,
        resolve,
        reject
      ));
    });

    // Awaiting message dispatch to catch any associated errors.
    // There is no hurry, we are not going to receive a response until message is sent.
    await this.stream.requests.send({
      requestId: this.requestIdxCounter++,
      request: r
    });

    return result;
  }

  public async complete() {
    await this.stream.requests.complete();
  }
}
