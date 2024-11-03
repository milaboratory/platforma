import * as fp from 'fs/promises';
import * as path from 'path';

const iconsFolder = './src/assets/icons/icon-assets';

async function normalizeIconNames() {
  for await (const dirent of await fp.readdir(iconsFolder, { withFileTypes: true })) {
    const parts = dirent.name.split('_');
    if (parts.length > 2) {
      const newName = parts[0] + '_' + parts.slice(1).join('-');
      await fp.rename(path.resolve(dirent.parentPath, dirent.name), path.resolve(dirent.parentPath, newName));
    }
  }
}

async function generateSCSS() {
  const dict = {};

  for await (const dirent of await fp.readdir(iconsFolder, { withFileTypes: true })) {
    const parts = dirent.name.split('_');

    if (parts.length !== 2) {
      throw Error('Invalid icon: ' + JSON.stringify(dirent));
    }

    const [size, icon] = parts;

    dict[size] = dict[size] ?? [];

    dict[size].push(icon);
  }

  for (const [size, lst] of Object.entries(dict)) {
    const json = {};

    const lines = lst.map((name) => {
      const icon = name.split('.')[0];
      json[icon] = name;
      return `  ${icon}: '${name}'`; // keep extension
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
  await generateSCSS();
})().catch(console.error);
