#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function getSvgFiles(dir) {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    dirents.map(async (d) => {
      const full = path.resolve(dir, d.name);
      if (d.isDirectory()) return await getSvgFiles(full);
      if (d.isFile() && path.extname(d.name).toLowerCase() === ".svg") return full;
      return [];
    })
  );
  return nested.flat();
}

function toPascalCase(fileName) {
  return fileName
    .replace(/[-_]+/g, " ")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+(.)/g, (_, ch) => ch.toUpperCase())
    .replace(/^./, (ch) => ch.toUpperCase());
}

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

function extractSize(svg) {
  const w = svg.match(/\bwidth=['\"]?([\d.]+)(?:px)?['\"]?/i);
  const h = svg.match(/\bheight=['\"]?([\d.]+)(?:px)?['\"]?/i);
  return {
    width: w ? `${w[1]}px` : 'unset',
    height: h ? `${h[1]}px` : 'unset',
  };
}

function buildStyles() {
  return `/* ⚠️ AUTOGENERATED. DO NOT EDIT. */
.svg-icon {
  
}
  `;
}

function buildVueSFC(name, dataUri, cssPath, width, height) {
  return `<!-- ⚠️ AUTOGENERATED. DO NOT EDIT. -->
<script lang="ts">
import '${cssPath}';
export default { name: '${name}' };
</script>

<template>
  <div class="svg-icon ${name}" style="width: ${width}; height: ${height}" />
</template>

<style>
  .${name} { background-image: url("${dataUri}"); }
</style>
`;
}

async function createStyles(outDir) {
  await fs.mkdir(outDir, { recursive: true });
  const styles = buildStyles();
  const destPath = path.join(outDir, "svg-styles.css");
  await fs.writeFile(destPath, styles, "utf8");

  return destPath;
}

async function createComponents(srcDir, outDir, absCssPath) {
  if (!srcDir || !outDir) {
    console.error("\nUSAGE: node generate-inline-svg-vue.js <svgDir> <outputDir>\n");
    process.exit(1);
  }

  const cssPath = path.relative(outDir, absCssPath);

  await fs.mkdir(outDir, { recursive: true });

  const svgFiles = await getSvgFiles(srcDir);
  if (!svgFiles.length) {
    console.error("SVG files not found in", srcDir);
    process.exit(1);
  }

  for (const file of svgFiles) {
    const rawSvg = await fs.readFile(file, "utf8");
    const componentName = 'Svg'+toPascalCase(path.basename(file, ".svg"));
    const dataUri = svgToDataUri(rawSvg);
    const { width, height } = extractSize(rawSvg);
    const vueSFC = buildVueSFC(componentName, dataUri, cssPath, width, height);
    const destPath = path.join(outDir, `${componentName}.vue`);
    await fs.writeFile(destPath, vueSFC, "utf8");
  }

  return svgFiles.length;
}

const dir = path.dirname(fileURLToPath(import.meta.url));

createStyles(path.resolve(dir,'../src/generated/components/svg'))
  .then((cssPath) => Promise.all([
    createComponents(path.resolve(dir,'../src/assets/images'), path.resolve(dir,'../src/generated/components/svg/images'), cssPath),
  ]))
  .then(([count]) => {
    console.log(`Created ${count} SVG components`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });