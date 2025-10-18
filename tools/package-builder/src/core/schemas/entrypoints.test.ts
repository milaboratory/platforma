import { test, expect } from 'vitest';
import type { z } from 'zod/v4';
import * as entrypoints from './entrypoints';
import * as testArtifacts from './test-artifacts';

const parseJSON = <T extends z.ZodTypeAny>(data: string, schema: T): z.infer<T> => {
  const parsedData: unknown = JSON.parse(data);
  return schema.parse(parsedData);
};

test.for([
  { epTypes: ['environment'], artType: 'environment', variant: 'minimal', data: testArtifacts.JavaEnvironmentEntrypoint },
  { epTypes: ['environment'], artType: 'environment', variant: 'with reference', data: testArtifacts.JavaEnvironmentEntrypointWithReference },
  { epTypes: ['asset'], artType: 'asset', variant: 'minimal', data: testArtifacts.AssetEntrypoint },
  { epTypes: ['binary'], artType: 'binary', variant: 'minimal', data: testArtifacts.BinaryEntrypoint },
  { epTypes: ['binary'], artType: 'binary', variant: 'with reference', data: testArtifacts.BinaryEntrypointWithReference },
  { epTypes: ['binary'], artType: 'binary', variant: 'limited platforms', data: testArtifacts.LimitedPlatformsBinaryEntrypoint },
  { epTypes: ['binary'], artType: 'binary', variant: 'version override', data: testArtifacts.CustomBinaryEntrypoint },
  { epTypes: ['binary'], artType: 'binary', variant: 'version docker', data: testArtifacts.BinaryEntrypointWithDocker },
  { epTypes: ['binary'], artType: 'java', variant: 'minimal', data: testArtifacts.JavaEntrypoint },
  { epTypes: ['binary'], artType: 'java', variant: 'with reference', data: testArtifacts.JavaEntrypointWithReference },
  { epTypes: ['binary', 'docker'], artType: 'java', variant: 'with docker', data: testArtifacts.JavaEntrypointWithDocker },
  { epTypes: ['binary'], artType: 'python', variant: 'minimal', data: testArtifacts.PythonEntrypoint },
  { epTypes: ['binary'], artType: 'python', variant: 'with reference', data: testArtifacts.PythonEntrypointWithReference },
  { epTypes: ['binary', 'docker'], artType: 'python', variant: 'with docker', data: testArtifacts.PythonEntrypointWithDocker },
  { epTypes: ['binary'], artType: 'R', variant: 'with reference', data: testArtifacts.REntrypointWithReference },
  { epTypes: ['binary'], artType: 'R', variant: 'minimal', data: testArtifacts.REntrypoint },
  { epTypes: ['binary'], artType: 'R', variant: 'with reference', data: testArtifacts.REntrypointWithReference },
  { epTypes: ['binary', 'docker'], artType: 'R', variant: 'with docker', data: testArtifacts.REntrypointWithDocker },
  { epTypes: ['conda'], artType: 'conda', variant: 'minimal', data: testArtifacts.CondaEntrypoint },
  { epTypes: ['conda'], artType: 'conda', variant: 'with reference', data: testArtifacts.CondaEntrypointWithReference },
  { epTypes: ['conda', 'docker'], artType: 'conda', variant: 'with docker', data: testArtifacts.CondaEntrypointWithDocker },
  { epTypes: ['docker'], artType: 'docker', variant: 'minimal', data: testArtifacts.DockerEntrypoint },
  { epTypes: ['docker'], artType: 'docker', variant: 'with reference', data: testArtifacts.DockerEntrypointWithReference },
])('parse $artType artifact ($variant)', ({ epTypes, artType, data }) => {
  const ep = parseJSON(data, entrypoints.entrypointSchema);
  for (const epType of epTypes) {
    switch (epType) {
      case 'environment':
        expect(ep.environment).toBeDefined();
        break;
      case 'asset':
        expect(ep.asset).toBeDefined();
        break;
      case 'binary': {
        expect(ep.binary).toBeDefined();
        const art = ep.binary!.artifact;
        if (typeof art !== 'string') {
          expect(art.type).toEqual(artType);
        }
        break;
      }
      case 'conda': {
        expect(ep.conda).toBeDefined();
        const art = ep.conda!.artifact;
        if (typeof art !== 'string') {
          expect(art.registry).toBeDefined();
          expect(art.spec).toBeDefined();
        }
        break;
      }
      case 'docker': {
        expect(ep.docker).toBeDefined();
        const dockerArt = ep.docker!.artifact;
        if (typeof dockerArt !== 'string') {
          expect(dockerArt.dockerfile).toBeDefined();
          expect(dockerArt.context).toBeDefined();
          expect(dockerArt.registry).toBeDefined();
        }
        break;
      }
      default:
        throw new Error('epType not covered by test logic');
    }
  }
});
