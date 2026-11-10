import { expect, test } from "vitest";
import { advisoryLock } from "./advisory_locks";

test("an aborted wait leaves the queue and the next waiter gets the lock", async () => {
  const id = "advisory-lock-abort";
  const releaseFirst = await advisoryLock(id);
  const controller = new AbortController();
  const aborted = advisoryLock(id, controller.signal);
  const next = advisoryLock(id);

  controller.abort(new Error("stop"));
  await expect(aborted).rejects.toThrow("stop");

  releaseFirst();
  const releaseNext = await next;
  releaseNext();

  const releaseAgain = await advisoryLock(id);
  releaseAgain();
});

test("an already aborted signal rejects at once", async () => {
  const controller = new AbortController();
  controller.abort(new Error("gone"));
  await expect(advisoryLock("advisory-lock-pre-aborted", controller.signal)).rejects.toThrow(
    "gone",
  );
});
