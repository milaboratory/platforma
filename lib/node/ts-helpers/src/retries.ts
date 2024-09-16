import { JitterOpts, jitter, sleep } from "./temporal";

export async function withRetries(
  nAttempts: number,
  jitterOpts: JitterOpts,
  cb: () => Promise<void>,
  retryOn: (e: unknown) => boolean
) {
  let lastError: unknown;

  for (let i = 0; i < nAttempts; i++) {
    try {
      await cb();
      return;
    } catch (e) {
      lastError = e;
      if (retryOn(e)) {
        await sleep(jitter(jitterOpts));
        continue;
      }
      throw e;
    }
  }

  throw new Error(
    'withRetries failed after ' +
      nAttempts +
      ' attempts. Last error: ' +
      JSON.stringify(lastError)
  );
}
