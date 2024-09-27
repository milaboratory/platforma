import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import * as util from './util';
import winston from 'winston';
import * as core from './core';
import os from 'os';

/** Creates a block by cloning block-boilerplate repository. */
export function createBlock(
  logger: winston.Logger,
  options: {
    'block-name': string;
    path: string;
  }
) {
  const targetPath = util.resolveTilde(options.path);
  const tempDir = path.join(os.tmpdir(), fs.mkdtempSync('create-block'));
  const templateName = 'block-boilerplate';
  const repoDir = path.join(tempDir, templateName);

  gitClone(logger, tempDir, 'git@github.com:milaboratory/block-boilerplate.git', 'failed to clone block-boilerplate');
  cleanupRepository(repoDir);
  applyOptionsToRepository(logger, repoDir, options);
  moveRepositoryToTarget(logger, repoDir, targetPath);
}

function gitClone(logger: winston.Logger, dir: string, url: string, errorMsg: string) {
  logger.info(`cloning "${url}" into "${dir}"...`);
  fs.mkdirSync(dir);
  core.checkRunError(
    spawnSync('git', ['clone', url], { cwd: dir, env: { ...process.env }, stdio: 'inherit' }),
    errorMsg
  );
}

function cleanupRepository(dir: string) {
  fs.rmSync(path.join(dir, '.git'), { recursive: true });
}

function applyOptionsToRepository(
  logger: winston.Logger,
  dir: string,
  options: { 'block-name': string; path: string }
) {
  logger.info(`replace everything in the template with provided options...`);
  const files = getAllFiles(dir).filter((f) => f.isFile());
  files.forEach((f) => {
    const fPath = path.join(f.parentPath, f.name);
    replaceInFile(fPath, /milaboratories.block-boilerplate/g, options['block-name']);
  });
}

function getAllFiles(dir: string): fs.Dirent[] {
  return fs.readdirSync(dir, {
    withFileTypes: true,
    recursive: true
  });
}

function replaceInFile(fPath: string, from: RegExp, to: string) {
  const content = fs.readFileSync(fPath);
  const newContent = content.toString().replaceAll(from, to);
  fs.writeFileSync(fPath, newContent);
}

function moveRepositoryToTarget(logger: winston.Logger, fromDir: string, toDir: string) {
  logger.info(`move block-boilerplate into ${toDir}`);
  fs.cpSync(fromDir, toDir, { recursive: true });
}
