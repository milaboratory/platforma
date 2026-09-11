import { test, expect } from "vitest";
import * as v from "valibot";
import * as artifacts from "./artifacts";
import * as testArtifacts from "./test-artifacts";

const parseArtifact = <T extends v.GenericSchema>(data: string, schema: T): v.InferOutput<T> => {
  const parsedData: unknown = JSON.parse(data);
  return v.parse(schema, parsedData);
};

// ['conda', artifacts.condaPackageSchema, testArtifacts.CondaArtifact],

test.for([
  {
    type: "environment",
    variant: "minimal",
    schema: artifacts.environmentSchema,
    data: testArtifacts.JavaEnvironmentArtifactWithType,
  },
  {
    type: "binary",
    variant: "minimal",
    schema: artifacts.binarySchema,
    data: testArtifacts.BinaryArtifact,
  },
  {
    type: "binary",
    variant: "version override",
    schema: artifacts.binarySchema,
    data: testArtifacts.CustomVersionArtifact,
  },
  {
    type: "java",
    variant: "minimal",
    schema: artifacts.javaSchema,
    data: testArtifacts.JavaArtifact,
  },
  {
    type: "python",
    variant: "minimal",
    schema: artifacts.pythonSchema,
    data: testArtifacts.PythonArtifact,
  },
  { type: "R", variant: "minimal", schema: artifacts.rSchema, data: testArtifacts.RArtifact },
  {
    type: "docker",
    variant: "minimal",
    schema: artifacts.dockerSchema,
    data: testArtifacts.DockerArtifactWithType,
  },
  {
    type: "docker",
    variant: "with pkg",
    schema: artifacts.dockerSchema,
    data: testArtifacts.DockerArtifactWithPkg,
  },
  {
    type: "docker",
    variant: "with dockerfile",
    schema: artifacts.dockerSchema,
    data: testArtifacts.DockerArtifactWithDockerfile,
  },
  {
    type: "conda",
    variant: "minimal",
    schema: artifacts.condaSchema,
    data: testArtifacts.CondaArtifactWithType,
  },
])("parse $type artifact ($variant)", ({ type, schema, data }) => {
  const binary = parseArtifact(data, schema);
  expect(binary.type).toEqual(type);
});
