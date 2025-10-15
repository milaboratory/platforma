import { test, expect } from 'vitest';
import type { z } from 'zod';
import * as entrypoints from './entrypoints';
import * as testArtifacts from './test-artifacts';

const parseJSON = <T extends z.ZodTypeAny>(data: string, schema: T): z.infer<T> => {
  const parsedData: unknown = JSON.parse(data);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return schema.parse(parsedData);
};

// ['conda', artifacts.condaPackageSchema, testArtifacts.CondaArtifact],

test.for([
  { epType: 'env', artType: 'environment', variant: 'minimal', data: testArtifacts.JavaEnvironmentEntrypoint },
  { epType: 'env', artType: 'environment', variant: 'with reference', data: testArtifacts.JavaEnvironmentEntrypointWithReference },
  { epType: 'asset', artType: 'asset', variant: 'minimal', data: testArtifacts.AssetEntrypoint },
  { epType: 'soft', artType: 'binary', variant: 'minimal', data: testArtifacts.BinaryEntrypoint },
  { epType: 'soft', artType: 'binary', variant: 'with reference', data: testArtifacts.BinaryEntrypointWithReference },
  { epType: 'soft', artType: 'binary', variant: 'limited platforms', data: testArtifacts.LimitedPlatformsBinaryEntrypoint },
  { epType: 'soft', artType: 'binary', variant: 'version override', data: testArtifacts.CustomBinaryEntrypoint },
  { epType: 'soft', artType: 'binary', variant: 'version docker', data: testArtifacts.BinaryEntrypointWithDocker },
  { epType: 'soft', artType: 'java', variant: 'minimal', data: testArtifacts.JavaEntrypoint },
  { epType: 'soft', artType: 'java', variant: 'with reference', data: testArtifacts.JavaEntrypointWithReference },
  { epType: 'soft+docker', artType: 'java', variant: 'with docker', data: testArtifacts.JavaEntrypointWithDocker },
  { epType: 'soft', artType: 'python', variant: 'minimal', data: testArtifacts.PythonEntrypoint },
  { epType: 'soft', artType: 'python', variant: 'with reference', data: testArtifacts.PythonEntrypointWithReference },
  { epType: 'soft+docker', artType: 'python', variant: 'with docker', data: testArtifacts.PythonEntrypointWithDocker },
  { epType: 'soft', artType: 'R', variant: 'with reference', data: testArtifacts.REntrypointWithReference },
  { epType: 'soft', artType: 'R', variant: 'minimal', data: testArtifacts.REntrypoint },
  { epType: 'soft', artType: 'R', variant: 'with reference', data: testArtifacts.REntrypointWithReference },
  { epType: 'soft+docker', artType: 'R', variant: 'with docker', data: testArtifacts.REntrypointWithDocker },
  { epType: 'docker', artType: 'docker', variant: 'minimal', data: testArtifacts.DockerEntrypoint },
  { epType: 'docker', artType: 'docker', variant: 'with reference', data: testArtifacts.DockerEntrypointWithReference },
])('parse $artType artifact ($variant)', ({ epType, artType, data }) => {
  const ep = parseJSON(data, entrypoints.entrypointSchema);
  switch (epType) {
    case 'env':
      expect(ep.environment).toBeDefined();
      break;
    case 'asset':
      expect(ep.asset).toBeDefined();
      break;
    case 'soft': {
      expect(ep.binary).toBeDefined();
      const art = ep.binary!.artifact;
      if (typeof art !== 'string') {
        expect(art.type).toEqual(artType);
      }
      break;
    }
    case 'soft+docker': {
      expect(ep.binary).toBeDefined();
      const art = ep.binary!.artifact;
      if (typeof art !== 'string') {
        expect(art.type).toEqual(artType);
      }
      expect(ep.docker).toBeDefined();
      const dockerArt = ep.docker!.artifact;
      if (typeof dockerArt !== 'string') {
        expect(dockerArt.type).toEqual('docker');
      }
      break;
    }
    case 'docker': {
      expect(ep.docker).toBeDefined();
      const dockerArt = ep.docker!.artifact;
      if (typeof dockerArt !== 'string') {
        expect(dockerArt.type).toEqual('docker');
      }
      break;
    }
    default:
      throw new Error('epType not covered by test logic');
  }
});
