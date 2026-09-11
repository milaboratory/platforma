import * as v from "valibot";
import * as defaults from "../../defaults";
import * as artifacts from "./artifacts";
import * as util from "../util";

export const remoteLocationSchema = v.object({
  registry: v.pipe(v.string(), v.description("name of the registry to use for package download")),
  package: v.pipe(
    v.string(),
    v.description("full package path in registry, e.g. 'common/jdk/21.0.2.13.1-{os}-{arch}.tgz"),
  ),
});

export const assetSchema = v.object({
  ...remoteLocationSchema.entries,
  url: v.pipe(v.string(), v.description("asset download URL")),
});
export type assetInfo = v.InferOutput<typeof assetSchema>;

export const dockerSchema = v.object({
  tag: v.pipe(
    v.string(),
    v.description("full image tag to pull on backend side to execute this software"),
  ),
  entrypoint: v.pipe(v.array(v.string()), v.description("override image's entrypoint")),
  cmd: v.pipe(v.array(v.string()), v.description("command to be run in the container")),

  pkg: v.optional(
    v.pipe(
      v.string(),
      v.description(
        'what to substitute in place of "{pkg}" variable in "cmd" (for artifacts with docker autogeneration)',
      ),
    ),
    defaults.DOCKER_PLACEHOLDER_PKG,
  ),
});
export type dockerInfo = v.InferOutput<typeof dockerSchema>;

export const runEnvironmentSchema = v.object({
  type: v.picklist(artifacts.runEnvironmentTypes),
  ...remoteLocationSchema.entries,

  ["r-version"]: v.optional(v.string()),
  ["python-version"]: v.optional(v.string()),
  ["java-version"]: v.optional(v.string()),

  envVars: v.optional(
    v.array(
      v.pipe(
        v.string(),
        v.regex(
          /=/,
          "environment variable should be specified in format: <var-name>=<var-value>, i.e.: MY_ENV=value",
        ),
      ),
    ),
  ),

  binDir: v.string(),
});
export type runEnvInfo = v.InferOutput<typeof runEnvironmentSchema>;

export const runDependencyJavaSchema = v.object({
  ...runEnvironmentSchema.entries,
  type: v.literal("java"),
  name: v.pipe(
    v.string(),
    v.description("name used to import this package as software dependency of tengo script"),
  ),
});
export type runEnvDependencyJava = v.InferOutput<typeof runDependencyJavaSchema>;

export const runDependencyPythonSchema = v.object({
  ...runEnvironmentSchema.entries,
  type: v.literal("python"),
  ["python-version"]: v.string(),
  name: v.pipe(
    v.string(),
    v.description("name used to import this package as software dependency of tengo script"),
  ),
});
export type runEnvDependencyPython = v.InferOutput<typeof runDependencyPythonSchema>;

export const runDependencyRSchema = v.object({
  ...runEnvironmentSchema.entries,
  type: v.literal("R"),
  ["r-version"]: v.string(),
  name: v.pipe(
    v.string(),
    v.description("name used to import this package as software dependency of tengo script"),
  ),
});
export type runEnvDependencyR = v.InferOutput<typeof runDependencyRSchema>;

export type runEnvDependency = runEnvDependencyJava | runEnvDependencyPython | runEnvDependencyR;

export const commonPackageSettingsSchema = v.object({
  cmd: v.pipe(
    v.array(v.string()),
    v.minLength(1),
    v.description("run given command, appended by args from workflow"),
  ),

  envVars: v.optional(
    v.array(
      v.pipe(
        v.string(),
        v.regex(
          /=/,
          "full environment variable specification is required: <var-name>=<var-value>, e.g.: IS_CI=yes",
        ),
      ),
    ),
  ),
});

export const binaryPackageSchema = v.object({
  type: v.literal("binary"),
  ...commonPackageSettingsSchema.entries,

  pkg: v.optional(
    v.pipe(
      v.string(),
      v.description("location of all package contents in Docker container (default: /app)"),
    ),
  ),
});

export const javaPackageSettingsSchema = v.object({
  type: v.literal("java"),

  ...commonPackageSettingsSchema.entries,
  runEnv: runDependencyJavaSchema,
});

export const pythonPackageSettingsSchema = v.object({
  type: v.literal("python"),

  ...commonPackageSettingsSchema.entries,
  runEnv: runDependencyPythonSchema,

  toolset: v.string(),
  dependencies: v.pipe(
    v.record(v.string(), v.string()),
    v.description(
      "paths of files that describe dependencies for given toolset: say, requirements.txt for 'pip'",
    ),
  ),
});

export const rPackageSettingsSchema = v.object({
  type: v.literal("R"),

  ...commonPackageSettingsSchema.entries,
  runEnv: runDependencyRSchema,

  toolset: v.string(),
  dependencies: v.pipe(
    v.record(v.string(), v.string()),
    v.description(
      "paths of files that describe dependencies for given toolset: say, requirements.txt for 'pip'",
    ),
  ),
});

export const condaPackageSchema = v.object({
  type: v.literal("conda"),
  ...commonPackageSettingsSchema.entries,

  ["micromamba-version"]: v.pipe(
    v.string(),
    v.description("version of micromamba to be used to operate with conda environments"),
  ),
  ["conda-root-dir"]: v.optional(
    v.pipe(v.string(), v.description("root directory of conda environment inside package root")),
    defaults.CONDA_DATA_LOCATION,
  ),

  spec: v.pipe(
    v.string(),
    v.description("location of spec.yaml describing conda environment, relative to package root."),
  ),
});

export const remoteSoftwareSchema = v.union([
  v.object({ ...remoteLocationSchema.entries, ...binaryPackageSchema.entries }),
  v.object({ ...remoteLocationSchema.entries, ...javaPackageSettingsSchema.entries }),
  v.object({ ...remoteLocationSchema.entries, ...pythonPackageSettingsSchema.entries }),
  v.object({ ...remoteLocationSchema.entries, ...rPackageSettingsSchema.entries }),
  v.object({ ...remoteLocationSchema.entries, ...condaPackageSchema.entries }),
]);
export type remoteSoftwareType = v.InferOutput<typeof remoteSoftwareSchema>;

export const localLocationSchema = v.object({
  hash: v.pipe(
    v.string(),
    v.description(
      "hash of software directory. Makes deduplication to work properly when you actively develop software",
    ),
  ),
  path: v.pipe(
    v.string(),
    v.description("absolute path to root directory of software on local host"),
  ),
});

export const localSoftwareSchema = v.variant("type", [
  v.object({ ...localLocationSchema.entries, ...binaryPackageSchema.entries }),
  v.object({ ...localLocationSchema.entries, ...javaPackageSettingsSchema.entries }),
  v.object({ ...localLocationSchema.entries, ...pythonPackageSettingsSchema.entries }),
  v.object({ ...localLocationSchema.entries, ...rPackageSettingsSchema.entries }),
  v.object({ ...localLocationSchema.entries, ...condaPackageSchema.entries }),
  // Docker can be used 'as usual' without any special 'local' section magic
]);
export type localSoftwareType = v.InferOutput<typeof localSoftwareSchema>;

// Full .sw.json file schema
export const swJsonSchema = v.pipe(
  v.object({
    isDev: v.optional(v.boolean()),

    asset: v.optional(assetSchema),
    binary: v.optional(remoteSoftwareSchema),
    docker: v.optional(dockerSchema),
    runEnv: v.optional(runEnvironmentSchema),
    local: v.optional(localSoftwareSchema),
  }),
  v.check(
    (data) =>
      util.toInt(data.runEnv) +
        util.toInt(data.binary || data.docker) + // allow both docker and binary to be set in single entrypoint
        util.toInt(data.asset) +
        util.toInt(data.local) ==
      1,
    "entrypoint cannot point to several packages at once: choose 'environment', 'binary', 'asset', 'conda' or 'local'",
  ),
);

export type swJsonType = v.InferOutput<typeof swJsonSchema> & {
  id: util.artifactID;
};
