import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';
import type { PythonPackage } from './package-info';
import type winston from 'winston';
import * as pkg from './package';

export interface PythonDockerOptions {
  pythonVersion: string;
  toolset: string;
  requirementsFile: string;
  context: string;
  dockerfile: string;
  tag: string;
  entrypoint: string;
}

export interface PythonDockerImageInfo {
  tag: string;
  packageName: string;
  packageVersion: string;
  pythonVersion: string;
  requirementsFile: string;
  toolset: string;
}

export function generatePythonDockerfile(
  packageRoot: string,
  pythonPkg: PythonPackage,
  options: PythonDockerOptions = getDefaultPythonDockerOptions(),
): string {
  // Check if requirements.txt exists in the package root
  const requirementsPath = path.join(packageRoot, options.requirementsFile);
  const hasRequirements = fs.existsSync(requirementsPath);

  // Read template from assets
  const templatePath = pkg.assets('python-dockerfile.template');
  const templateContent = fs.readFileSync(templatePath, 'utf-8');

  // Simple variable substitution
  const installDeps = hasRequirements
    ? `COPY ${options.requirementsFile} .\nRUN ${options.toolset} install --no-cache-dir -r ${options.requirementsFile}`
    : `# No '${options.requirementsFile}' file found, skipping dependency installation`;
  const dockerfile = templateContent
    .replace(/\$\{PYTHON_VERSION\}/g, options.pythonVersion)
    .replace(/\$\{PYTHON_INSTALL_DEPS\}/g, installDeps);

  return dockerfile;
}

export function buildPythonDockerImage(
  logger: winston.Logger,
  packageRoot: string,
  pythonPkg: PythonPackage,
  options: PythonDockerOptions = getDefaultPythonDockerOptions(),
): PythonDockerImageInfo | null {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-pkg-python-'));
  // Cleanup function for temporary directory
  const cleanup = () => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      logger.warn(`Failed to clean up temporary directory ${tempDir}: ${String(error)}`);
    }
  };

  try {
    const dockerfileContent = generatePythonDockerfile(packageRoot, pythonPkg, options);
    const dockerfilePath = path.join(tempDir, 'Dockerfile');
    fs.writeFileSync(dockerfilePath, dockerfileContent);

    const tag = `pl-pkg-python-${pythonPkg.name}:${pythonPkg.version || 'latest'}`;

    logger.info(`Building Python Docker image with tag: ${tag}`);
    logger.info(`Using temporary Dockerfile at: ${dockerfilePath}`);
    logger.info(`Python version: '${options.pythonVersion}', Toolset: '${options.toolset}', Requirements: '${options.requirementsFile}'`);

    const result = spawnSync('docker', ['build', '-t', tag, packageRoot, '-f', dockerfilePath], {
      stdio: 'inherit',
      cwd: packageRoot,
    });

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      throw new Error(`Docker build failed with status ${result.status}`);
    }

    logger.info(`Python Docker image '${tag}' built successfully`);
    return {
      tag,
      packageName: pythonPkg.name,
      packageVersion: pythonPkg.version || 'latest',
      pythonVersion: options.pythonVersion,
      requirementsFile: options.requirementsFile,
      toolset: options.toolset,
    };
  } finally {
    cleanup();
  }
}

export function preparePythonDockerOptions(packageRoot: string, buildParams: PythonPackage): PythonDockerOptions {
  const options = getDefaultPythonDockerOptions();
  const pythonVersion = getPythonVersionFromEnvironment(buildParams.environment);
  if (pythonVersion) {
    options.pythonVersion = pythonVersion;
  }

  if (buildParams.docker?.context) {
    options.context = path.resolve(packageRoot, buildParams.docker.context);
  }

  if (buildParams.docker?.dockerfile) {
    options.dockerfile = path.resolve(packageRoot, buildParams.docker.dockerfile);
  } else {
    // TODO: generate if not exist; Don't forget to add cleanup tmp dir to destructor
  }

  if (buildParams.docker?.tag) {
    options.tag = buildParams.docker.tag;
  }

  if (buildParams.docker?.entrypoint) {
    options.entrypoint = buildParams.docker.entrypoint.join(' ');
  }

  verifyPythonDockerOptions(options);
  return options;
}

function getPythonVersionFromEnvironment(environmentId: string): string | undefined {
  // Extract version from environment ID like "@platforma-open/milaboratories.runenv-python-3:3.12.6"
  const versionMatch = environmentId.match(/:([^:]+)$/);
  return versionMatch ? versionMatch[1] : undefined;
}

function getDefaultPythonDockerOptions(): PythonDockerOptions {
  return {
    pythonVersion: '3.12.6',
    toolset: 'pip',
    requirementsFile: 'requirements.txt',
    context: '.',
    dockerfile: 'Dockerfile',
    tag: 'latest',
    entrypoint: '',
  };
}

function verifyPythonDockerOptions(options: PythonDockerOptions) {
  if (!fs.existsSync(options.dockerfile)) {
    throw new Error(`Dockerfile '${options.dockerfile}' not found`);
  }

  if (!fs.existsSync(options.context)) {
    throw new Error(`Context '${options.context}' not found`);
  }
}
