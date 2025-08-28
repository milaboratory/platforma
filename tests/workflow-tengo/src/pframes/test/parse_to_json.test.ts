import { Annotation, type PColumnSpec } from '@milaboratories/pl-middle-layer';
import { Pl } from '@milaboratories/pl-middle-layer';
import { awaitStableState } from '@platforma-sdk/test';
import { assertJson, assertResource, eTplTest } from './extended_tpl_test';

const TIMEOUT = 15_000;

type ResWithData = { data?: Uint8Array | string };
type JsonNode = { content: unknown };
const parseResJson = (res: unknown) => {
  assertResource(res);
  const r = res as ResWithData;
  return JSON.parse(Buffer.from(r.data as Uint8Array | string).toString());
};
const getSpec = (node: unknown) => {
  assertJson(node);
  return (node as JsonNode).content as PColumnSpec;
};

eTplTest.concurrent(
  'should correctly parse TSV string content using parseToJson with all column kinds',
  { timeout: TIMEOUT },
  async ({ helper, expect, stHelper }) => {
    // Sample TSV content with header and data rows
    const tsvContent
      = 'name\tage\tcity\tdata1\tdata2\nJohn\t25\tNYC\t100\tA\nJane\t30\tLA\t200\tB\n';

    // Settings using all three column kinds
    const settings = {
      axes: [
        {
          column: 'name',
          spec: {
            type: 'String',
            name: 'personName',
            annotations: {
              [Annotation.Label]: 'Person Name',
            } satisfies Annotation,
          },
        },
      ],
      columns: [
        // Column kind - parses individual TSV fields
        {
          kind: 'column',
          column: 'age',
          id: 'person_age',
          spec: {
            valueType: 'Int',
            name: 'age',
            annotations: {
              [Annotation.Label]: 'Age',
            } satisfies Annotation,
          },
        },
        {
          kind: 'column',
          column: 'city',
          id: 'person_city',
          spec: {
            valueType: 'String',
            name: 'city',
            annotations: {
              [Annotation.Label]: 'City',
            } satisfies Annotation,
          },
        },
        // Line kind - exports raw TSV line content
        {
          kind: 'line',
          id: 'full_line',
          spec: {
            valueType: 'String',
            name: 'fullLine',
            annotations: {
              [Annotation.Label]: 'Full Line',
            } satisfies Annotation,
          },
        },
        // JSON-line kind - exports JSON-encoded line content
        {
          kind: 'json-line',
          id: 'person_data',
          spec: {
            valueType: 'String',
            name: 'personData',
            annotations: {
              [Annotation.Label]: 'Person Data JSON',
            } satisfies Annotation,
          },
          columns: [
            {
              column: 'data1',
              id: 'numeric_data',
              type: 'Int',
            },
            {
              column: 'data2',
              id: 'string_data',
              type: 'String',
            },
          ],
        },
      ],
    };

    const result = await helper.renderTemplate(
      true,
      'pframes.test.parse_to_json',
      ['result'],
      (tx) => {
        return {
          params: tx.createValue(
            Pl.JsonObject,
            JSON.stringify({
              tsvContent,
              settings,
            }),
          ),
        };
      },
    );

    const r = stHelper.tree(result.resultEntry);
    const finalResult = await awaitStableState(r, TIMEOUT);

    assertResource(finalResult);
    const theResult = finalResult.inputs['result'];
    assertResource(theResult);
    expect(theResult.resourceType.name).toEqual('PFrame');

    // Validate column kind results (person_age)
    const ageData = theResult.inputs['person_age.data'];
    assertResource(ageData);
    expect(ageData.resourceType.name).toEqual('PColumnData/Json');

    // Access the JSON data content directly from the resource
    assertResource(ageData);
    const ageDataContent = parseResJson(ageData);
    expect(ageDataContent.data).toEqual({
      '["John"]': 25,
      '["Jane"]': 30,
    });

    const ageSpec = theResult.inputs['person_age.spec'];
    const ageSpecContent = getSpec(ageSpec);
    expect(ageSpecContent.valueType).toBe('Int');
    expect(ageSpecContent.name).toBe('age');
    expect(ageSpecContent.axesSpec).toHaveLength(1);
    expect(ageSpecContent.axesSpec[0].name).toBe('personName');
    expect(ageSpecContent.axesSpec[0].type).toBe('String');

    // Validate column kind results (person_city)
    const cityData = theResult.inputs['person_city.data'];
    assertResource(cityData);
    const cityDataContent = parseResJson(cityData);
    expect(cityDataContent.data).toEqual({
      '["John"]': 'NYC',
      '["Jane"]': 'LA',
    });

    // Validate line kind results (full_line)
    const lineData = theResult.inputs['full_line.data'];
    assertResource(lineData);
    const lineDataContent = parseResJson(lineData);
    expect(lineDataContent.data).toEqual({
      '["John"]': 'John\t25\tNYC\t100\tA',
      '["Jane"]': 'Jane\t30\tLA\t200\tB',
    });

    const lineSpec = theResult.inputs['full_line.spec'];
    const lineSpecContent = getSpec(lineSpec);
    expect(lineSpecContent.valueType).toBe('String');
    expect(lineSpecContent.name).toBe('fullLine');

    // Validate json-line kind results (person_data)
    const jsonData = theResult.inputs['person_data.data'];
    assertResource(jsonData);
    const jsonDataContent = parseResJson(jsonData);
    expect(jsonDataContent.data).toEqual({
      '["John"]': '{"numeric_data":100,"string_data":"A"}',
      '["Jane"]': '{"numeric_data":200,"string_data":"B"}',
    });

    const jsonSpec = theResult.inputs['person_data.spec'];
    const jsonSpecContent = getSpec(jsonSpec);
    expect(jsonSpecContent.valueType).toBe('String');
    expect(jsonSpecContent.name).toBe('personData');
  },
);
