import * as fs from 'node:fs';
import * as path from 'node:path';
import type * as entrypoint from './schemas/entrypoint';
import type winston from 'winston';
import * as paths from './paths';
import * as util from './util';
import type * as artifacts from './schemas/artifacts';
import { resolveRunEnvironment } from './resolver';

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
  pkg: string;
  envVars: string[]; // custom environment variables set for run environment
}

export interface DockerOptions {
  context: string;
  dockerfile: string;
  entrypoint: string[];
  pkg: string;
}

export interface PythonDockerOptions extends PythonOptions, DockerOptions {}

function generatePythonDockerfileContent(options: PythonOptions): string {
  // Read template from assets
  const templatePath = paths.assets('python-dockerfile.template');
  const templateContent = fs.readFileSync(templatePath, 'utf-8');

  const envVars = options.envVars.map((envVar) => `ENV ${envVar}`).join('\n');

  // Generate Dockerfile with dependencies
  return templateContent
    .replace(/\$\{RUNENV_ENVS\}/g, envVars)
    .replace(/\$\{PYTHON_VERSION\}/g, options.pythonVersion)
    .replace(/\$\{REQUIREMENTS_PATH\}/g, options.requirements)
    .replace(/\$\{REQUIREMENTS_FILENAME\}/g, path.basename(options.requirements))
    .replace(/\$\{TOOLSET\}/g, options.toolset)
    .replace(/\$\{PKG\}/g, options.pkg);
}

export function prepareDockerOptions(
  logger: winston.Logger,
  currentPackageRoot: string,
  currentPackageName: string,
  artifactID: string,
  buildParams: entrypoint.PythonPackage,
): DockerOptions {
  logger.debug(`Preparing Docker options for Python package: ${buildParams.name} (id: ${artifactID})`);

  const options = getDefaultPythonOptions();

  const pythonInfo = getRunEnvironmentPythonInfo(logger, currentPackageRoot, currentPackageName, buildParams.environment);
  if (pythonInfo.pythonVersion) {
    logger.debug(`Extracted Python version from environment: ${pythonInfo.pythonVersion}`);
    options.pythonVersion = pythonInfo.pythonVersion;
  } else {
    logger.debug(`No Python version found in environment, using default: ${options.pythonVersion}`);
  }
  options.envVars = pythonInfo.envVars;

  if (buildParams.dependencies) {
    options.toolset = buildParams.dependencies.toolset;
    options.requirements = buildParams.dependencies.requirements;
  }

  if (buildParams.pkg) {
    options.pkg = buildParams.pkg;
  }

  if (!buildParams.root) {
    throw util.CLIError('Cannot prepare Docker options: package root directory is not specified. Please ensure the "root" property is set in the build parameters.');
  }
  const contextDir = path.resolve(buildParams.root ?? currentPackageRoot);

  options.requirements = path.join(contextDir, options.requirements);
  const hasRequirements = fs.existsSync(options.requirements);

  if (!hasRequirements) {
    // If requirements.txt doesn't exist, create an empty one
    fs.writeFileSync(options.requirements, '# No dependencies specified\n');
    logger.warn(`Created empty requirements.txt at: ${options.requirements}`);
  }
  // If requirements.txt exists, use relative path for Docker COPY command
  options.requirements = path.relative(contextDir, options.requirements);

  // Generate a temporary directory for the Dockerfile
  const tmpDir = path.join(currentPackageRoot, 'dist', 'docker');
  fs.mkdirSync(tmpDir, { recursive: true });
  logger.debug(`Created temporary Docker directory: ${tmpDir}`);

  const dockerfile = {
    content: generatePythonDockerfileContent(options),
    path: path.resolve(tmpDir, `Dockerfile-${artifactID}`),
  };

  fs.writeFileSync(dockerfile.path, dockerfile.content);
  logger.debug(`Written Dockerfile to: ${dockerfile.path}`);

  const result: DockerOptions = {
    dockerfile: dockerfile.path,
    context: contextDir,
    entrypoint: [],
    pkg: options.pkg,
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

export function getRunEnvironmentPythonInfo(
  logger: winston.Logger,
  currentPackageRoot: string,
  currentPackageName: string,
  runEnvironmentID: artifacts.artifactIDString,
  { normalizeForDocker = true }: { normalizeForDocker?: boolean } = {},
): {
    pythonVersion: string | undefined;
    envVars: string[];
  } {
  if (!runEnvironmentID) {
    return {
      pythonVersion: undefined,
      envVars: [],
    };
  }

  const environmentDescriptor = resolveRunEnvironment(logger, currentPackageRoot, currentPackageName, runEnvironmentID, 'python');

  let pythonVersion: string | undefined = environmentDescriptor['python-version'];
  const envVars = environmentDescriptor.envVars ?? [];
  if (!pythonVersion) {
    pythonVersion = undefined;
    const trimmedInput = runEnvironmentID.trim();
    if (!trimmedInput) {
      return {
        pythonVersion: undefined,
        envVars,
      };
    }

    const colonIndex = trimmedInput.indexOf(':');
    if (colonIndex === -1 || colonIndex === trimmedInput.length - 1) {
      return {
        pythonVersion: undefined,
        envVars,
      };
    }

    pythonVersion = trimmedInput.slice(colonIndex + 1);
    if (pythonVersion.startsWith('python')) {
      return {
        pythonVersion: undefined,
        envVars,
      };
    }
  }

  if (!normalizeForDocker) {
    return {
      pythonVersion,
      envVars,
    };
  }

  const normalizedTag = normalizeDockerTag(pythonVersion);
  if (!normalizedTag) {
    return {
      pythonVersion: undefined,
      envVars,
    };
  }

  if (!isValidPythonVersion(normalizedTag) || !isValidDockerTag(normalizedTag)) {
    return {
      pythonVersion: undefined,
      envVars,
    };
  }

  return {
    pythonVersion: normalizedTag,
    envVars,
  };
}

function getDefaultPythonOptions(): PythonOptions {
  return {
    pythonVersion: '3.12.10-slim',
    toolset: 'pip',
    requirements: 'requirements.txt',
    pkg: '/app/',
    envVars: [],
  };
}

function verifyDockerOptions(options: DockerOptions) {
  if (!fs.existsSync(options.dockerfile)) {
    throw util.CLIError(`Dockerfile '${options.dockerfile}' not found`);
  }

  if (!fs.existsSync(options.context)) {
    throw util.CLIError(`Context '${options.context}' not found`);
  }
}
