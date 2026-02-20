import * as fp from "fs/promises";
import * as path from "path";

const iconsFolder = "./src/assets/icons/icon-assets";

function svgToDataUri(svg) {
  const cleaned = svg
    .replace(/[\n\r\t]+/g, " ")
    .replace(/>\s+</g, "><")
    .trim();
  const encoded = encodeURIComponent(cleaned)
    .replace(/'/g, "%27")
    .replace(/"/g, "%22")
    .replace(/#/g, "%23");
  return `data:image/svg+xml;utf8,${encoded}`;
}

async function normalizeIconNames() {
  for await (const dirent of await fp.readdir(iconsFolder, { withFileTypes: true })) {
    const parts = dirent.name.split("_");
    if (parts.length > 2) {
      const newName = parts[0] + "_" + parts.slice(1).join("-");
      await fp.rename(
        path.resolve(dirent.parentPath, dirent.name),
        path.resolve(dirent.parentPath, newName),
      );
    }
  }
}

async function generateIconsArtifacts() {
  const dict = {};

  for await (const dirent of await fp.readdir(iconsFolder, { withFileTypes: true })) {
    if (dirent.name.startsWith(".")) {
      continue;
    }

    const parts = dirent.name.split("_");

    if (parts.length !== 2) {
      throw Error("Invalid icon: " + JSON.stringify(dirent));
    }

    const [size, icon] = parts;
    const svg = svgToDataUri(
      String(await fp.readFile(path.resolve(dirent.parentPath, dirent.name), "utf8")),
    );

    dict[size] = dict[size] ?? [];
    dict[size].push({ name: icon, svg });
  }

  for (const [size, objs] of Object.entries(dict)) {
    const names = objs.map(({ name }) => `  '${name.substring(0, name.length - 4)}'`).join(",\n");

    await fp.writeFile(
      `./src/generated/icons-${size}.ts`,
      `export const icons${size} = [\n${names},\n] as const;\n`,
    );
  }
}

(async () => {
  await normalizeIconNames();
  await generateIconsArtifacts();
})().catch(console.error);
