import * as fp from 'fs/promises';
import * as path from 'path';

const iconsFolder = './src/assets/icons/icon-assets';

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
    const parts = dirent.name.split('_');
    if (parts.length > 2) {
      const newName = parts[0] + '_' + parts.slice(1).join('-');
      await fp.rename(path.resolve(dirent.parentPath, dirent.name), path.resolve(dirent.parentPath, newName));
    }
  }
}

async function generateIconsArtifacts() {
  const dict = {};

  for await (const dirent of await fp.readdir(iconsFolder, { withFileTypes: true })) {
    if (dirent.name.startsWith('.')) {
      continue;
    }

    const parts = dirent.name.split('_');

    if (parts.length !== 2) {
      throw Error('Invalid icon: ' + JSON.stringify(dirent));
    }

    const [size, icon] = parts;
    const svg = svgToDataUri(String(await fp.readFile(path.resolve(dirent.parentPath, dirent.name), 'utf8')));

    dict[size] = dict[size] ?? [];
    dict[size].push({ name: icon, svg });
  }

  for (const [size, list] of Object.entries(dict)) {
    const json = {};

    const lines = list.map(({ name, svg }) => {
      const icon = name.split('.')[0];
      json[icon] = name;
      return `  ${icon}: url('${svg}')`; // keep extension
    });

    const names = Object.keys(json)
      .map((k) => `  '${k}'`)
      .join(',\n');

    await fp.writeFile(`./src/assets/icons/icons-${size}-generated.scss`, `$icons${size}: (\n${lines.join(',\n')}\n)`);
    await fp.writeFile(`./src/generated/icons-${size}.ts`, `export const maskIcons${size} = [\n${names},\n] as const;\n`);
    await fp.writeFile(`./src/assets/icons/icons-${size}-generated.json`, JSON.stringify(json, null, 2));
  }
}

(async () => {
  await normalizeIconNames();
  await generateIconsArtifacts();
})().catch(console.error);
