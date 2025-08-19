import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
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
  cleanup: () => void;
}

function generatePythonDockerfileContent(packageRoot: string, options: PythonDockerOptions): string {
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

export function preparePythonDockerOptions(logger: winston.Logger, packageRoot: string, buildParams: PythonPackage): PythonDockerOptions {
  const options = getDefaultPythonDockerOptions();

  const pythonVersion = getPythonVersionFromEnvironment(buildParams.environment);
  if (pythonVersion) {
    options.pythonVersion = pythonVersion;
  }

  options.context = path.resolve(packageRoot, buildParams.docker?.context ?? options.context);

  if (buildParams.docker?.dockerfile) {
    options.dockerfile = path.resolve(packageRoot, buildParams.docker.dockerfile);
  } else {
    const date = new Date(Date.now()).toISOString();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `pl-pkg-python-${buildParams.name}-${date}`));

    // Cleanup function for temporary directory
    const cleanup = () => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (error) {
        logger.warn(`Failed to clean up temporary directory ${tmpDir}: ${String(error)}`);
      }
    };

    try {
      const content = generatePythonDockerfileContent(packageRoot, options);
      const dockerfilePath = path.join(tmpDir, 'Dockerfile');
      fs.writeFileSync(dockerfilePath, content);
      options.dockerfile = path.resolve(dockerfilePath);
    } catch (error) {
      cleanup();
      logger.error(`Failed to generate Dockerfile: ${String(error)}`);
    }
    options.cleanup = cleanup;
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
    cleanup: () => {},
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
