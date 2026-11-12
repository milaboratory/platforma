import { addAbortListener } from "node:events";

/** Runs `call` with a signal of its own that follows `signal` until the call ends: protobuf-ts never removes its abort listener. */
export async function withCallAbortSignal<T>(
  signal: AbortSignal | undefined,
  call: (abort: AbortSignal) => Promise<T>,
): Promise<T> {
  signal?.throwIfAborted();
  const controller = new AbortController();
  using links = new DisposableStack();
  if (signal !== undefined) {
    links.use(addAbortListener(signal, () => controller.abort(signal.reason)));
  }
  return await call(controller.signal);
}
