import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const Templates = {
  main: { type: "from-file", path: resolve(__dirname, "./dist/tengo/tpl/main.plj.gz") },
};
