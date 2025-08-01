import type { PColumnSpec } from '@milaboratories/pl-middle-layer';
import { Pl } from '@milaboratories/pl-middle-layer';
import { awaitStableState } from '@platforma-sdk/test';
import { assertJson, assertResource, eTplTest } from './extended_tpl_test';

eTplTest.concurrent(
  'should correctly parse TSV string content using parseToJson with all column kinds',
  { timeout: 15000 },
  async ({ helper, expect, stHelper }) => {
    // Sample TSV content with header and data rows
    const tsvContent = 'name\tage\tcity\tdata1\tdata2\nJohn\t25\tNYC\t100\tA\nJane\t30\tLA\t200\tB\n';

    // Settings using all three column kinds
    const settings = {
      axes: [
        {
          column: 'name',
          spec: {
            type: 'String',
            name: 'personName',
            annotations: {
              'pl7.app/label': 'Person Name',
            },
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
              'pl7.app/label': 'Age',
            },
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
              'pl7.app/label': 'City',
            },
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
              'pl7.app/label': 'Full Line',
            },
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
              'pl7.app/label': 'Person Data JSON',
            },
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
    const finalResult = await awaitStableState(r, 10000);

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
    const ageDataContent = JSON.parse(Buffer.from(ageData.data!).toString());
    expect(ageDataContent.data).toEqual({
      '["John"]': 25,
      '["Jane"]': 30,
    });

    const ageSpec = theResult.inputs['person_age.spec'];
    assertJson(ageSpec);
    const ageSpecContent = ageSpec.content as PColumnSpec;
    expect(ageSpecContent.valueType).toBe('Int');
    expect(ageSpecContent.name).toBe('age');
    expect(ageSpecContent.axesSpec).toHaveLength(1);
    expect(ageSpecContent.axesSpec[0].name).toBe('personName');
    expect(ageSpecContent.axesSpec[0].type).toBe('String');

    // Validate column kind results (person_city)
    const cityData = theResult.inputs['person_city.data'];
    assertResource(cityData);
    const cityDataContent = JSON.parse(Buffer.from(cityData.data!).toString());
    expect(cityDataContent.data).toEqual({
      '["John"]': 'NYC',
      '["Jane"]': 'LA',
    });

    // Validate line kind results (full_line)
    const lineData = theResult.inputs['full_line.data'];
    assertResource(lineData);
    const lineDataContent = JSON.parse(Buffer.from(lineData.data!).toString());
    expect(lineDataContent.data).toEqual({
      '["John"]': 'John\t25\tNYC\t100\tA',
      '["Jane"]': 'Jane\t30\tLA\t200\tB',
    });

    const lineSpec = theResult.inputs['full_line.spec'];
    assertJson(lineSpec);
    const lineSpecContent = lineSpec.content as PColumnSpec;
    expect(lineSpecContent.valueType).toBe('String');
    expect(lineSpecContent.name).toBe('fullLine');

    // Validate json-line kind results (person_data)
    const jsonData = theResult.inputs['person_data.data'];
    assertResource(jsonData);
    const jsonDataContent = JSON.parse(Buffer.from(jsonData.data!).toString());
    expect(jsonDataContent.data).toEqual({
      '["John"]': '{"numeric_data":100,"string_data":"A"}',
      '["Jane"]': '{"numeric_data":200,"string_data":"B"}',
    });

    const jsonSpec = theResult.inputs['person_data.spec'];
    assertJson(jsonSpec);
    const jsonSpecContent = jsonSpec.content as PColumnSpec;
    expect(jsonSpecContent.valueType).toBe('String');
    expect(jsonSpecContent.name).toBe('personData');
  },
);
