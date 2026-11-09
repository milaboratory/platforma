import path from "node:path";
import { randomUUID } from "node:crypto";
import * as tp from "node:timers/promises";
import { TestHelpers } from "@milaboratories/pl-client";
import { expect, test } from "vitest";
import { MiddleLayer } from "./middle_layer";

const blackhole = 1_000_000_000;

async function timed(action: () => Promise<void>): Promise<number> {
  const startedAt = performance.now();
  await action();
  return performance.now() - startedAt;
}

test("closeProject and close return soon on a link that stopped answering", async () => {
  await TestHelpers.withTempRoot(
    async (pl, proxy) => {
      const ml = await MiddleLayer.init(pl, path.resolve(`work/${randomUUID()}`), {
        defaultTreeOptions: { pollingInterval: 250, stopPollingDelay: 500 },
        devBlockUpdateRecheckInterval: 300,
        projectRefreshInterval: 1_000,
        localSecret: MiddleLayer.generateLocalSecret(),
        openFileDialogCallback: () => {
          throw new Error("Not implemented.");
        },
      });
      const projectId = await ml.createProject({ label: "dead link" });
      await ml.openProject(projectId);
      const project = ml.getOpenedProject(projectId);
      await project.overview.getValue();
      // The refresh loop must be in its pause, so the stuck action below takes the project lock.
      await tp.setTimeout(300);

      proxy.setLatency(blackhole);
      const stuckAction = project.reorderBlocks([]).catch(() => {});
      await tp.setTimeout(1_500);

      expect(await timed(() => ml.closeProject(projectId))).toBeLessThan(2_000);
      expect(await timed(() => ml.close())).toBeLessThan(2_000);

      proxy.setLatency(0);
      await proxy.disconnectAll();
      await stuckAction;
    },
    { viaTcpProxy: true },
  );
});
