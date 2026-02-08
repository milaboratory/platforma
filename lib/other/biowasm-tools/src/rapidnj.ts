// @ts-expect-error legacy code
import init from "../assets/rapidnj";

export default async function rapidnj(input: string): Promise<string> {
  const module = await init();
  module.FS_writeFile("input.fa", input);
  module.callMain(["input.fa", "-x", "output.nwk"]);
  return module.FS_readFile("output.nwk", { encoding: "utf8" });
}
