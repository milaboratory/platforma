import { Pl } from "@milaboratories/pl-middle-layer";
import { tplTest } from "@platforma-sdk/test";

/*
 * End-to-end check for the E2BIG failure on large working directories
 * (fixed in Platforma 4.3.2): a command must start and complete when its
 * working directory holds more files than the old inline expected-items list
 * could carry (~7300 entries).
 *
 * `exec.run.large_workdir` fills the working directory with 10000 files and
 * runs `hello-world` in it. The software has both a binary and a docker
 * distribution, so the same test covers the local exec runner and the k8s
 * runner.
 *
 * The message carries a random suffix on purpose: an exec step with a stable
 * CID is deduplicated by the backend, and a cached result would never start a
 * job at all.
 */
tplTest.concurrent(
  "run-in-workdir-with-10k-files",
  async ({ helper, expect }) => {
    const helloText = `Hello from a workdir with 10000 files (${Math.random()})`;

    const result = await helper.renderTemplate(false, "exec.run.large_workdir", ["main"], (tx) => ({
      text: tx.createValue(Pl.JsonObject, JSON.stringify(helloText)),
    }));
    const mainResult = result.computeOutput("main", (a) => a?.getDataAsString());

    expect(await mainResult.awaitStableValue()).eq(helloText + "\n");
  },
  // Building 10000 workdir entries means 10000 value resources plus the map
  // that holds them, all in one transaction. That is slow on the backend, so
  // the default 15s test timeout is not enough.
  300_000,
);
