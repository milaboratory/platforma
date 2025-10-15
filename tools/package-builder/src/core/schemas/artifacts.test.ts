import { test, expect } from 'vitest';
import type { z } from 'zod';
import * as artifacts from './artifacts';
import * as testArtifacts from './test-artifacts';

const parseArtifact = <T extends z.ZodTypeAny>(data: string, schema: T): z.infer<T> => {
  const parsedData: unknown = JSON.parse(data);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return schema.parse(parsedData);
};

// ['conda', artifacts.condaPackageSchema, testArtifacts.CondaArtifact],

test.for([
  { type: 'environment', variant: 'minimal', schema: artifacts.environmentPackageSchema, data: testArtifacts.JavaEnvironmentArtifact },
  { type: 'binary', variant: 'minimal', schema: artifacts.binaryPackageSchema, data: testArtifacts.BinaryArtifact },
  { type: 'binary', variant: 'version override', schema: artifacts.binaryPackageSchema, data: testArtifacts.CustomVersionArtifact },
  { type: 'java', variant: 'minimal', schema: artifacts.javaPackageSchema, data: testArtifacts.JavaArtifact },
  { type: 'python', variant: 'minimal', schema: artifacts.pythonPackageSchema, data: testArtifacts.PythonArtifact },
  { type: 'R', variant: 'minimal', schema: artifacts.rPackageSchema, data: testArtifacts.RArtifact },
  { type: 'docker', variant: 'minimal', schema: artifacts.dockerPackageSchema, data: testArtifacts.DockerArtifact },
  { type: 'docker', variant: 'with pkg', schema: artifacts.dockerPackageSchema, data: testArtifacts.DockerArtifactWithPkg },
  { type: 'docker', variant: 'with dockerfile', schema: artifacts.dockerPackageSchema, data: testArtifacts.DockerArtifactWithDockerfile },
  { type: 'conda', variant: 'minimal', schema: artifacts.condaPackageSchema, data: testArtifacts.CondaArtifact },
])('parse $type artifact ($variant)', ({ type, schema, data }) => {
  const binary = parseArtifact(data, schema);
  expect(binary.type).toEqual(type);
});
