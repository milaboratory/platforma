import * as v from "valibot";
import * as artifacts from "./artifacts";
import * as util from "../util";

const envVarsSchema = v.array(
  v.pipe(
    v.string(),
    v.regex(
      /=/,
      "full environment variable specification is required: <var-name>=<var-value>, e.g.: IS_CI=yes",
    ),
  ),
);

export const EnyrypointReferencePattern =
  /^(?<fullName>(?:(?<scope>@[a-z0-9-.]+)\/)?(?<name>[a-z0-9-.]+))\/(?<path>.*)$/;

export const referenceSchema = v.pipe(
  v.string(),
  v.regex(
    EnyrypointReferencePattern,
    "entrypoint reference must contain full package name and path to the file inside",
  ),
);

const orRef = <T extends v.GenericSchema>(schema: T) =>
  v.union([
    v.pipe(
      v.string("not a reference to artifact"),
      v.description('reference to artifact in "artifacts" section'),
    ),
    schema,
  ]);

// Common options for all software packages: everything that can be run on backend side.
export const softwareOptionsSchema = v.strictObject({
  cmd: v.pipe(
    v.array(v.string("command artument must be a string")),
    v.minLength(1, "at least one argument is required"),
    v.check((cmd) => cmd[0].trim() != "", "first cmd argument must be non-empty string"),
    v.description(
      "command to run for this entrypoint. This command will be appended by <args> set inside workflow",
    ),
  ),
  envVars: v.optional(
    v.pipe(
      envVarsSchema,
      v.description("list of environment variables to be set for this entrypoint"),
    ),
  ),
});
export type softwareOptionsType = v.InferOutput<typeof softwareOptionsSchema>;

export const environmentOptionsSchema = v.strictObject({
  artifact: orRef(v.omit(artifacts.environmentSchema, ["type"])),
  envVars: v.optional(
    v.pipe(
      envVarsSchema,
      v.description(
        "list of environment variables to be set for any command inside this run environment",
      ),
    ),
  ),
});

// Full schema of single entrypoint in block-software.entrypoints
export const entrypointSchema = v.pipe(
  v.strictObject({
    reference: v.optional(referenceSchema),
    asset: v.optional(orRef(v.omit(artifacts.assetSchema, ["type"]))),
    environment: v.optional(environmentOptionsSchema),

    binary: v.optional(
      v.union([
        v.strictObject({
          ...softwareOptionsSchema.entries,
          artifact: orRef(artifacts.binarySchema),
        }),
        v.strictObject({
          ...softwareOptionsSchema.entries,
          artifact: orRef(artifacts.javaSchema),
        }),
        v.strictObject({
          ...softwareOptionsSchema.entries,
          artifact: orRef(artifacts.pythonSchema),
        }),
        v.strictObject({
          ...softwareOptionsSchema.entries,
          artifact: orRef(artifacts.rSchema),
        }),
      ]),
    ), // TODO: reduce nesting: put java, python and r to the level of binary, like conda.

    conda: v.optional(
      v.strictObject({
        ...softwareOptionsSchema.entries,
        artifact: orRef(v.omit(artifacts.condaSchema, ["type"])),
      }),
    ),
    docker: v.optional(
      v.strictObject({
        ...softwareOptionsSchema.entries,
        artifact: orRef(v.omit(artifacts.dockerSchema, ["type"])),
      }),
    ),
  }),
  v.check((data) => {
    const n =
      util.toInt(data.reference) +
      util.toInt(data.asset && !data.docker) + // no docker for assets
      util.toInt(data.binary || (data.binary && data.docker)) + // allow both docker and binary to be set in single entrypoint
      util.toInt(data.conda || (data.conda && data.docker)) + // allow both docker and conda to be set in single entrypoint
      util.toInt(data.environment && !data.docker); // no docker for environments

    if (n === 0) {
      return Boolean(data.docker); // allow separate docker entrypoints (without binary/conda/...)
    }

    return n === 1;
  }, "entrypoint cannot point to several packages at once: choose 'reference', 'asset', 'binary', 'environment' or 'docker'"),
);
export type entrypointType = v.InferOutput<typeof entrypointSchema>;

// Full block-software.entrypoints list schema
export const entrypointListSchema = v.record(
  v.pipe(
    v.string(),
    v.regex(/[-_a-z0-9.]/),
    v.description(
      "name of entrypoint descriptor, client should import to use this entrypoint (assets.importSoftware)",
    ),
  ),
  entrypointSchema,
);
export type entrypointListType = v.InferOutput<typeof entrypointListSchema>;

export interface ReferenceEntrypoint {
  type: "reference";
  name: string;
  reference: string;
}

export interface AssetEntrypoint {
  type: "asset";
  name: string;
  artifact: artifacts.withId<artifacts.assetType>;
}

export interface SoftwareEntrypoint {
  type: "software";
  name: string;
  artifact: artifacts.withId<
    | artifacts.binaryType
    | artifacts.condaType
    | artifacts.javaType
    | artifacts.pythonType
    | artifacts.rType
    | artifacts.dockerType
  >;
  cmd: string[];
  env: string[];
}

export interface EnvironmentEntrypoint {
  type: "environment";
  name: string;
  artifact: artifacts.withId<artifacts.environmentType>;
  env: string[];
}

export type PackageEntrypoint = AssetEntrypoint | SoftwareEntrypoint | EnvironmentEntrypoint;
export type Entrypoint = ReferenceEntrypoint | PackageEntrypoint;
export type EntrypointType = Extract<Entrypoint, { type: string }>["type"];
