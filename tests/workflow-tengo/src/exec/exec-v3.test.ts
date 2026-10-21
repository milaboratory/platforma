/* eslint-disable @typescript-eslint/no-unused-vars */
import { Pl } from "@milaboratories/pl-middle-layer";
import { tplTest } from "@platforma-sdk/test";

tplTest.concurrent(
  "v3: software failure finishes ready with an outcome",
  async ({ helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      "exec.run.v3_outcome",
      ["outcome", "workdirOut"],
      (tx) => ({
        script: tx.createValue(
          Pl.JsonObject,
          JSON.stringify(`echo boom-${Math.random()} >&2; exit 2`),
        ),
        image: tx.createValue(Pl.JsonObject, JSON.stringify("docker.io/busybox:latest")),
        attempt: tx.createValue(Pl.JsonObject, JSON.stringify(0)),
      }),
    );
    const outcome = await result
      .computeOutput("outcome", (a) => a?.getDataAsJson<any>())
      .awaitStableValue();

    expect(outcome.result).toBe("fail");
    expect(outcome.exitCode).toBe(2);
    expect(outcome.failDetails.reason).toBe("SoftwareError");
    expect(outcome.lastLogLines.join("\n")).toContain("boom");
    expect(outcome.attemptLimit).toBe(3);
  },
  300_000,
);
