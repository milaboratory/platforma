import { TestHelpers } from "@milaboratory/pl-client-v2";
import { ConsoleLoggerAdapter } from "@milaboratory/ts-helpers";
import { createDownloadUrlDriver } from "./helpers";
import * as os from 'node:os';
import { rawComputable } from "@milaboratory/computable";
import { text } from "node:stream/consumers";
import { Readable } from 'node:stream';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

test(
  'should download a tar archive and extracts its content and then deleted',
  async () => {
    await TestHelpers.withTempRoot(async client => {
      const logger = new ConsoleLoggerAdapter();
      const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test1-'));
      const driver = createDownloadUrlDriver(client, logger, dir);

      const url = new URL(
        "https://block.registry.platforma.bio/releases/v1/milaboratory/enter-numbers/0.2.1/frontend.tgz"
      );

      const c = rawComputable(() => driver.getPath(url))

      const path1 = await c.getValue();
      expect(path1).toBeUndefined();

      await c.listen();

      const path2 = await c.getValue();
      expect(path2).not.toBeUndefined();

      console.log("frontend saved to dir: ", path2);
      const indexJs = fs.createReadStream(path.join(path2!, 'index.js'));
      const indexJsCode = await text(Readable.toWeb(indexJs));
      expect(indexJsCode).toContain('use strict');

      c.resetState();
    })
  }
)
