import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PythonPackage } from './package-info';
import type winston from 'winston';
import * as pkg from './package';

const PYTHON_VERSION_PATTERNS = {
  PY3_PREFIX: /^3\./,
  VERSION_FORMAT: /^3\.\d+(?:\.\d+)?(?:[-+_][a-zA-Z0-9]+|(?:a|b|rc)\d+|[a-zA-Z]+\d+(?:\.[a-zA-Z0-9]+)*)*$/,
  DOCKER_SEPARATOR: /@.*$/,
  DOCKER_UNSAFE_CHARS: /[^A-Za-z0-9_.-]+/g,
  MULTIPLE_SEPARATORS: /[-.]{2,}/g,
  EDGE_SEPARATORS: /^[-.]+|[-.]+$/g,
  DOCKER_TAG_FORMAT: /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/,
};

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

function generatePythonDockerfileContent(options: PythonOptions): string {
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

export function prepareDockerOptions(logger: winston.Logger, packageRoot: string, pacakgeId: string, buildParams: PythonPackage): DockerOptions {
  logger.info(`Preparing Docker options for Python package: ${buildParams.name} (id: ${pacakgeId})`);

  const options = getDefaultPythonOptions();

  const pythonVersion = getPythonVersionFromEnvironment(buildParams.environment);
  if (pythonVersion) {
    logger.info(`Extracted Python version from environment: ${pythonVersion}`);
    options.pythonVersion = pythonVersion;
  } else {
    logger.debug(`No Python version found in environment, using default: ${options.pythonVersion}`);
  }

  if (buildParams.dependencies) {
    options.toolset = buildParams.dependencies.toolset;
    options.requirements = buildParams.dependencies.requirements;
  }
  options.requirements = path.resolve(packageRoot, options.requirements);

  // Generate a temporary directory for the Dockerfile
  const tmpDir = path.join(packageRoot, 'dist', 'docker');
  fs.mkdirSync(tmpDir, { recursive: true });
  logger.info(`Created temporary Docker directory: ${tmpDir}`);

  const dockerfile = {
    content: generatePythonDockerfileContent(options),
    path: path.resolve(tmpDir, `Dockerfile-${pacakgeId}`),
  };

  fs.writeFileSync(dockerfile.path, dockerfile.content);
  logger.info(`Written Dockerfile to: ${dockerfile.path}`);

  const result: DockerOptions = {
    dockerfile: dockerfile.path,
    context: path.resolve(packageRoot),
    entrypoint: [],
  };

  logger.debug(`Prepared Docker options: ${JSON.stringify(result)}`);
  verifyDockerOptions(result);
  return result;
}

function normalizeDockerTag(candidate: string): string | undefined {
  if (!candidate || typeof candidate !== 'string') {
    return undefined;
  }

  // First remove Docker-specific parts like @sha256:...
  let normalized = candidate.replace(PYTHON_VERSION_PATTERNS.DOCKER_SEPARATOR, '');

  // For cases like "3.12.6:latest", extract only the version part
  if (normalized.includes(':')) {
    normalized = normalized.split(':')[0];
  }

  // Clean up any remaining unsafe characters
  normalized = normalized
    .replace(PYTHON_VERSION_PATTERNS.DOCKER_UNSAFE_CHARS, '-')
    .replace(PYTHON_VERSION_PATTERNS.MULTIPLE_SEPARATORS, '-')
    .replace(PYTHON_VERSION_PATTERNS.EDGE_SEPARATORS, '');

  return normalized || undefined;
}

function isValidPythonVersion(version: string): boolean {
  return PYTHON_VERSION_PATTERNS.PY3_PREFIX.test(version)
    && PYTHON_VERSION_PATTERNS.VERSION_FORMAT.test(version);
}

function isValidDockerTag(tag: string): boolean {
  return PYTHON_VERSION_PATTERNS.DOCKER_TAG_FORMAT.test(tag);
}

export function getPythonVersionFromEnvironment(
  environmentId: string,
  { normalizeForDocker = true }: { normalizeForDocker?: boolean } = {},
): string | undefined {
  if (!environmentId) {
    return undefined;
  }

  const trimmedInput = environmentId.trim();
  if (!trimmedInput) {
    return undefined;
  }

  const colonIndex = trimmedInput.indexOf(':');
  if (colonIndex === -1 || colonIndex === trimmedInput.length - 1) {
    return undefined;
  }

  const versionTag = trimmedInput.slice(colonIndex + 1);
  if (versionTag.startsWith('python')) {
    return undefined;
  }

  if (!normalizeForDocker) {
    return versionTag;
  }

  const normalizedTag = normalizeDockerTag(versionTag);
  if (!normalizedTag) {
    return undefined;
  }

  if (!isValidPythonVersion(normalizedTag) || !isValidDockerTag(normalizedTag)) {
    return undefined;
  }

  return normalizedTag;
}

function getDefaultPythonOptions(): PythonOptions {
  return {
    pythonVersion: '3.12.6-slim',
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
