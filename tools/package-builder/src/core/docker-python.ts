import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PythonPackage } from './package-info';
import type winston from 'winston';
import * as pkg from './package';

export interface PythonOptions {
  pythonVersion: string;
  toolset: string;
  requirements: string;
}

export interface DockerOptions {
  context: string;
  dockerfile: string;
  entrypoint: string[];
}

export interface PythonDockerOptions extends PythonOptions, DockerOptions {}

function generatePythonDockerfileContent(packageRoot: string, options: PythonOptions): string {
  const hasRequirements = fs.existsSync(options.requirements);

  // Read template from assets
  const templatePath = pkg.assets('python-dockerfile.template');
  const templateContent = fs.readFileSync(templatePath, 'utf-8');

  // Simple variable substitution
  const installDeps = hasRequirements
    ? `COPY ${options.requirements} .\nRUN ${options.toolset} install --no-cache-dir -r ${options.requirements}`
    : `# No '${options.requirements}' file found, skipping dependency installation`;
  const dockerfile = templateContent
    .replace(/\$\{PYTHON_VERSION\}/g, options.pythonVersion)
    .replace(/\$\{PYTHON_INSTALL_DEPS\}/g, installDeps);

  return dockerfile;
}

export function prepareDockerOptions(logger: winston.Logger, packageRoot: string, buildParams: PythonPackage): DockerOptions {
  logger.info(`Preparing Docker options for Python package: ${buildParams.name}`);

  const options = getDefaultPythonOptions();
  options.requirements = path.resolve(packageRoot, options.requirements);

  const pythonVersion = getPythonVersionFromEnvironment(buildParams.environment);
  if (pythonVersion) {
    logger.info(`Extracted Python version from environment: ${pythonVersion}`);
    options.pythonVersion = pythonVersion;
  } else {
    logger.debug(`No Python version found in environment, using default: ${options.pythonVersion}`);
  }

  const tmpDir = fs.mkdtempSync(path.join(packageRoot, 'docker', `pl-pkg-python-${buildParams.name}`));
  logger.info(`Created temporary Docker directory: ${tmpDir}`);

  const dockerfile = {
    content: generatePythonDockerfileContent(packageRoot, options),
    path: path.join(tmpDir, 'Dockerfile'),
  };

  fs.writeFileSync(dockerfile.path, dockerfile.content);
  logger.info(`Written Dockerfile to: ${dockerfile.path}`);

  const result: DockerOptions = {
    dockerfile: dockerfile.path,
    context: path.resolve(packageRoot, '.'),
    entrypoint: [],
  };

  logger.debug(`Prepared Docker options: ${JSON.stringify(result)}`);
  verifyDockerOptions(result);
  return result;
}

function getPythonVersionFromEnvironment(environmentId: string): string | undefined {
  // Extract version from environment ID like "@platforma-open/milaboratories.runenv-python-3:3.12.6"
  const versionMatch = environmentId.match(/:([^:]+)$/);
  return versionMatch ? versionMatch[1] : undefined;
}

function getDefaultPythonOptions(): PythonOptions {
  return {
    pythonVersion: '3.12.6',
    toolset: 'pip',
    requirements: 'requirements.txt',
  };
}

function verifyDockerOptions(options: DockerOptions) {
  if (!fs.existsSync(options.dockerfile)) {
    throw new Error(`Dockerfile '${options.dockerfile}' not found`);
  }

  if (!fs.existsSync(options.context)) {
    throw new Error(`Context '${options.context}' not found`);
  }
}
