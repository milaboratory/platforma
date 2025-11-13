/* eslint-disable @stylistic/no-tabs */
import {
  canonicalizeJson,
  deriveLocalPObjectId,
  Pl,
  pTableValue,
  type PTableColumnSpec,
} from '@milaboratories/pl-middle-layer';
import { awaitStableState, tplTest } from '@platforma-sdk/test';
import { vi } from 'vitest';
import dedent from 'dedent';
import { Timeout, getFileContent, getTableData } from './helpers';

vi.setConfig({ testTimeout: Timeout });

const normalizeCsv = (str: string) => str.replace(/\r\n/g, '\n').trim();
const normalizeTsv = normalizeCsv;
const normalizeNdjson = normalizeCsv;

const normalizeAndSortCsv = (str: string) => {
  const lines = normalizeCsv(str).split('\n');
  const header = lines.shift();
  lines.sort();
  return [header, ...lines].join('\n');
};
const normalizeAndSortTsv = normalizeAndSortCsv;
const normalizeAndSortNdjson = (str: string) =>
  normalizeNdjson(str)
    .split('\n')
    .map((line) => {
      // Parse and re-stringify to normalize JSON formatting
      try {
        return canonicalizeJson(JSON.parse(line));
      } catch {
        return line; // Return as-is if not valid JSON
      }
    })
    .sort() // Sort lines for consistent comparison
    .join('\n');

tplTest.concurrent(
  'pt simple test',
  async ({ helper, expect, driverKit }) => {
    const inputTsvData = dedent`
      a	b
      1	X
      4	Y
      9	Z
    `;
    const expectedOutputTsvData = dedent`
      a	a_sqrt
      1	1.0
      4	2.0
      9	3.0
    `;

    const result = await helper.renderTemplate(
      false,
      'pt.simple',
      ['out'],
      (tx) => ({
        inputTsv: tx.createValue(Pl.JsonObject, JSON.stringify(inputTsvData)),
      }),
    );

    const outputTsvContent = await getFileContent(result, 'out', driverKit);

    expect(normalizeTsv(outputTsvContent)).toEqual(normalizeTsv(expectedOutputTsvData));
  },
);

tplTest.concurrent(
  'pt write frame test',
  async ({ helper, expect, driverKit }) => {
    const workflow = await helper.renderWorkflow('pt.write_frame', false, {
      inputCsv: dedent`
          a,b
          1,X
          9,Z
          4,Y
        `,
      saveFrameParams: {
        axes: [{
          column: 'a',
          spec: { name: 'a', type: 'Int' },
        }],
        columns: [{
          column: 'b',
          spec: { name: 'b', valueType: 'String' },
        }],
      },
    });

    const pTable = await getTableData(workflow, 'pf', driverKit);

    const pTableSpecs = pTable.map((col) => col.spec);
    expect(pTableSpecs).toEqual([
      {
        type: 'axis',
        id: { name: 'a', type: 'Int' },
        spec: { name: 'a', type: 'Int' },
      },
      {
        type: 'column',
        id: deriveLocalPObjectId(['pf'], 'b'),
        spec: {
          kind: 'PColumn',
          name: 'b',
          valueType: 'String',
          axesSpec: [{ name: 'a', type: 'Int' }],
        },
      },
    ] satisfies PTableColumnSpec[]);

    const pTableData = pTable.map((col) => {
      const rows: string[] = [];
      for (let i = 0; i < col.data.data.length; i++) {
        rows.push(pTableValue(col.data, i, { absent: '', na: '' })?.toString() ?? '');
      }
      return rows;
    });
    expect(pTableData).toEqual([
      ['1', '4', '9'],
      ['X', 'Y', 'Z'],
    ]);
  },
);

tplTest.concurrent.for([
  {
    case: '1 axis, 1 column',
    csvData: dedent`
      a,b
      1,X
      9,Z
      4,Y
    `,
    axes: [
      { column: 'a', spec: { name: 'a', type: 'Int' } },
    ],
    columns: [
      { column: 'b', spec: { name: 'b', valueType: 'String' } },
    ],
  },
  {
    case: '1 axis, 2 columns',
    csvData: dedent`
      a,b,c
      1,X,0.1
      9,Z,0.2
      4,Y,0.3
    `,
    axes: [
      { column: 'a', spec: { name: 'a', type: 'Int' } },
    ],
    columns: [
      { column: 'b', spec: { name: 'b', valueType: 'String' } },
      { column: 'c', spec: { name: 'c', valueType: 'Float' } },
    ],
  },
  {
    case: '2 axes, 1 column',
    csvData: dedent`
      a,b,c
      1,X,0.1
      9,Z,0.2
      4,Y,0.3
    `,
    axes: [
      { column: 'a', spec: { name: 'a', type: 'Int' } },
      { column: 'b', spec: { name: 'b', type: 'String' } },
    ],
    columns: [
      { column: 'c', spec: { name: 'c', valueType: 'Float' } },
    ],
  },
])(
  'pt frame roundtrip test - $case',
  async ({ csvData, axes, columns }, { helper, expect, driverKit }) => {
    const workflow1 = await helper.renderWorkflow('pt.write_frame', false, {
      inputCsv: csvData,
      saveFrameParams: { axes, columns },
    }, { blockId: 'block1' });

    const context1 = await awaitStableState(workflow1.context(), Timeout);
    const workflow2 = await helper.renderWorkflow('pt.read_frame', false, {
      axesNames: axes.map((axis) => axis.spec.name),
      columnNames: columns.map((column) => column.spec.name),
    }, { blockId: 'block2', parent: context1 });

    const csvContent = await getFileContent(workflow2, 'csv', driverKit);
    expect(normalizeCsv(csvContent)).eq(normalizeAndSortCsv(csvData));
  },
);

tplTest.concurrent(
  'pt ex1 test - window and groupBy operations',
  async ({ helper, expect, driverKit }) => {
    const inputTsvData = dedent`
      category	user_id	score	value
      A	user1	100	10
      A	user2	150	20
      B	user3	200	30
      A	user4	120	5
      B	user5	180	25
      C	user6	300	50
    `;

    const expectedOutputWindowsTsvData = dedent`
      category	user_id	score	value	category_sum_value	rank_in_category
      A	user1	100	10	35	3
      A	user2	150	20	35	1
      A	user4	120	5	35	2
      B	user3	200	30	55	1
      B	user5	180	25	55	2
      C	user6	300	50	50	1
    `;

    const expectedOutputGroupedTsvData = dedent`
      category	total_value_by_cat	avg_score_by_cat
      A	35	123.33333333333333
      B	55	190.0
      C	50	300.0
    `;

    const result = await helper.renderTemplate(
      false,
      'pt.ex1',
      ['out_windows', 'out_grouped'],
      (tx) => ({
        inputTsv: tx.createValue(Pl.JsonObject, JSON.stringify(inputTsvData)),
      }),
    );

    const [outputWindowsContent, outputGroupedContent] = await Promise.all([
      getFileContent(result, 'out_windows', driverKit),
      getFileContent(result, 'out_grouped', driverKit),
    ]);

    expect(normalizeAndSortTsv(outputWindowsContent)).toEqual(
      normalizeAndSortTsv(expectedOutputWindowsTsvData),
    );
    expect(normalizeAndSortTsv(outputGroupedContent)).toEqual(
      normalizeAndSortTsv(expectedOutputGroupedTsvData),
    );
  },
);

tplTest.concurrent(
  'pt ex2 test - filter, sort, limit operations',
  async ({ helper, expect, driverKit }) => {
    const inputTsvData = dedent`
      category	user_id	score	value
      A	user1	100	10
      A	user2	150	120
      B	user3	200	130
      A	user4	120	105
      B	user5	180	25
      C	user6	300	150
      B	user7	190	110
    `;

    // After filter (value > 100 AND category != "C"):
    // A user2 150 120
    // B user3 200 130
    // A user4 120 105
    // B user7 190 110
    // After sort (category asc, score desc):
    // A user2 150 120
    // A user4 120 105
    // B user3 200 130
    // B user7 190 110
    const expectedOutputTsvData = dedent`
      category	user_id	score	value
      A	user2	150	120
      A	user4	120	105
      B	user3	200	130
      B	user7	190	110
    `;

    const expectedOutputLimitedTsvData = dedent`
      category	user_id	score	value
      A	user2	150	120
      A	user4	120	105
    `;

    const result = await helper.renderTemplate(
      false,
      'pt.ex2',
      ['out_filtered_sorted', 'out_limited'],
      (tx) => ({
        inputTsv: tx.createValue(Pl.JsonObject, JSON.stringify(inputTsvData)),
      }),
    );

    const [outputContent, outputLimitedContent] = await Promise.all([
      getFileContent(result, 'out_filtered_sorted', driverKit),
      getFileContent(result, 'out_limited', driverKit),
    ]);

    expect(normalizeTsv(outputContent)).toEqual(normalizeTsv(expectedOutputTsvData));
    expect(normalizeTsv(outputLimitedContent)).toEqual(normalizeTsv(expectedOutputLimitedTsvData));
  },
);

tplTest.concurrent(
  'pt ex3 test - join operations',
  async ({ helper, expect, driverKit }) => {
    // No input files needed as data is defined in the template as strings

    const expectedOutputInnerJoin = dedent`
      id,name,val_left,name_from_right,val_right,info_for_test1
      1,Alice,100,Alice_R1,10,R_Info_1
      2,Bob,200,Bob_R1,20,R_Info_2
      4,David,400,David_R1,40,R_Info_4
    `;

    // dfLeft: id,name,val_left (1,Alice,100; 2,Bob,200; 3,Charlie,300; 4,David,400)
    // dfRight: id_r,name,val_right,info (ID1,Alice,10; ID2,Bob,20; ID4,David,40; ID5,Frank,50)
    // Joining on 'name'
    const expectedOutputLeftJoinOn = dedent`
      id,name,val_left,id_from_right,val_right,info
      1,Alice,100,ID1,10,R_Info_Alice
      2,Bob,200,ID2,20,R_Info_Bob
      3,Charlie,300,,,
      4,David,400,ID4,40,R_Info_David
    `; // David is in both
    // Frank from right is not included due to left join

    // dfLeftOn: common_key,name_l,val_l (K1,Alice_LO,100; K2,Bob_LO,200; K3,Charlie_LO,300)
    // dfRightOn: common_key,name_r,val_r (K1,Andrea_RO,10; K2,Robert_RO,20; K4,David_RO,400)
    // Joining on 'common_key' with coalesce=false
    // Polars default for coalesce=false on full join with common key names like 'common_key'
    // will create 'common_key' (from left) and 'common_key_right' (from right)
    const expectedOutputFullJoinOnNoCoalesce = dedent`
      common_key,name_l,common_key_right,name_r
      K1,Alice_LO,K1,Andrea_RO
      K2,Bob_LO,K2,Robert_RO
      K3,Charlie_LO,,
      ,,K4,David_RO
    `; // K3 only in left, K4 only in right

    // dfCrossLeft: item_id,item_name (L1,Apple; L2,Banana)
    // dfCrossRight: color_id,color_name (C1,Red; C2,Yellow)
    const expectedOutputCrossJoin = dedent`
      item_name,item_color
      Apple,Red
      Apple,Yellow
      Banana,Red
      Banana,Yellow
    `;

    const result = await helper.renderTemplate(
      false,
      'pt.ex3',
      [
        'out_inner_join',
        'out_left_join_on',
        'out_full_join_on_nocoalesce',
        'out_cross_join',
      ],
      (_tx) => ({}), // No dynamic inputs needed for this test
    );

    const [
      innerJoinContent,
      leftJoinOnContent,
      fullJoinOnNoCoalesceContent,
      crossJoinContent,
    ] = await Promise.all([
      getFileContent(result, 'out_inner_join', driverKit),
      getFileContent(result, 'out_left_join_on', driverKit),
      getFileContent(result, 'out_full_join_on_nocoalesce', driverKit),
      getFileContent(result, 'out_cross_join', driverKit),
    ]);

    expect(normalizeAndSortTsv(innerJoinContent)).toEqual(
      normalizeAndSortTsv(expectedOutputInnerJoin),
    );
    expect(normalizeAndSortTsv(leftJoinOnContent)).toEqual(
      normalizeAndSortTsv(expectedOutputLeftJoinOn),
    );
    expect(normalizeAndSortTsv(fullJoinOnNoCoalesceContent)).toEqual(
      normalizeAndSortTsv(expectedOutputFullJoinOnNoCoalesce),
    );
    expect(normalizeAndSortTsv(crossJoinContent)).toEqual(
      normalizeAndSortTsv(expectedOutputCrossJoin),
    );
  },
);

tplTest.concurrent(
  'pt ex4 test - dynamic substring',
  async ({ helper, expect, driverKit }) => {
    const inputTsvData = dedent`
      text	start	len	end
      HelloWorld	0	5	5
      AnotherTest	2	4	6
      Short	1	10	11
    `;

    const expectedOutputSubstrLen = dedent`
      text	sub
      HelloWorld	Hello
      AnotherTest	othe
      Short	hort
    `;

    const expectedOutputSubstrEnd = dedent`
      text	sub
      HelloWorld	Hello
      AnotherTest	othe
      Short	hort
    `;

    const expectedOutputSubstrStatic = dedent`
      text	sub
      HelloWorld	ello
      AnotherTest	noth
      Short	hort
    `;

    const result = await helper.renderTemplate(
      false,
      'pt.ex4',
      ['out_substr_len', 'out_substr_end', 'out_substr_static'],
      (tx) => ({
        inputTsv: tx.createValue(Pl.JsonObject, JSON.stringify(inputTsvData)),
      }),
    );

    const [outputSubstrLen, outputSubstrEnd, outputSubstrStatic] = await Promise.all([
      getFileContent(result, 'out_substr_len', driverKit),
      getFileContent(result, 'out_substr_end', driverKit),
      getFileContent(result, 'out_substr_static', driverKit),
    ]);

    expect(normalizeTsv(outputSubstrLen)).toEqual(normalizeTsv(expectedOutputSubstrLen));
    expect(normalizeTsv(outputSubstrEnd)).toEqual(normalizeTsv(expectedOutputSubstrEnd));
    expect(normalizeTsv(outputSubstrStatic)).toEqual(normalizeTsv(expectedOutputSubstrStatic));
  },
);

tplTest.concurrent(
  'pt ex5 test - comprehensive string functions',
  async ({ helper, expect, driverKit }) => {
    // No input needed - data is embedded in template

    const expectedOutputStringFunctions = dedent`
      email	filename	content	code	has_email_pattern	contains_apple_literal	contains_hello_ci	has_citrus	has_fruits_ci	count_letter_a	word_count	username	domain	code_letters	starts_with_john	is_data_file	is_pdf	is_dot_com
      john.doe@example.com	document.pdf	This contains apple and banana fruits	HELLO123	true	true	true	false	true	6	6	john.doe	example.com	HELLO	true	false	true	true
      jane_smith@test.org	image.jpg	Looking for orange or lemon juice	hello456	true	false	true	true	false	1	6	jane_smith	test.org	hello	false	false	false	false
      bob@company.co.uk	data.csv	No fruits here just vegetables	GOODBYE789	true	false	false	false	false	1	5	bob	company.co.uk	GOODBYE	false	true	false	false
      alice.wilson@demo.net	readme.txt	Apple pie and cherry tart available	world999	true	false	false	false	true	5	6	alice.wilson	demo.net	world	false	false	false	false
      frank@startup.io	script.py	Banana smoothie with lime juice	test888	true	false	false	true	true	3	5	frank	startup.io	test	false	false	false	false
    `;

    const result = await helper.renderTemplate(
      false,
      'pt.ex5',
      ['out_string_functions'],
      (_tx) => ({}), // No dynamic inputs needed for this test
    );

    const outputContent = await getFileContent(result, 'out_string_functions', driverKit);

    expect(normalizeTsv(outputContent)).toEqual(normalizeTsv(expectedOutputStringFunctions));
  },
);

tplTest.concurrent(
  'pt ndjson test - comprehensive NDJSON format support',
  async ({ helper, expect, driverKit }) => {
    // No input needed - data is embedded in template

    // Expected NDJSON output with computed score_bonus column
    const expectedOutputNdjsonBasic = dedent`
      {"id":1,"name":"Alice","score":95.5,"active":true,"score_bonus":105.5}
      {"id":2,"name":"Bob","score":87.2,"active":false,"score_bonus":97.2}
      {"id":3,"name":"Charlie","score":92.1,"active":true,"score_bonus":102.1}
      {"id":4,"name":"Diana","score":98.7,"active":true,"score_bonus":108.7}
      {"id":5,"name":"Eve","score":83.4,"active":false,"score_bonus":93.4}
    `;

    // Expected NDJSON output with nRows=3 and filtered for active=true
    // Note: Only first 3 rows are read due to nRows limit, then filtered for active=true
    const expectedOutputNdjsonLimited = dedent`
      {"id":1,"name":"Alice","score":95.5,"active":true}
      {"id":3,"name":"Charlie","score":92.1,"active":true}
    `;

    // Expected CSV output sorted by score (descending)
    const expectedOutputNdjsonToCsv = dedent`
      id,name,score,active
      4,Diana,98.7,true
      1,Alice,95.5,true
      3,Charlie,92.1,true
      2,Bob,87.2,false
      5,Eve,83.4,false
    `;

    // Expected NDJSON output from CSV input with enriched columns
    const expectedOutputCsvToNdjson = dedent`
      {"id":1,"display_name":"Alice (1)","score":95.5,"active":true,"high_performer":true}
      {"id":2,"display_name":"Bob (2)","score":87.2,"active":false,"high_performer":false}
      {"id":3,"display_name":"Charlie (3)","score":92.1,"active":true,"high_performer":true}
    `;

    const result = await helper.renderTemplate(
      false,
      'pt.ndjson',
      [
        'out_ndjson_basic',
        'out_ndjson_limited',
        'out_ndjson_to_csv',
        'out_csv_to_ndjson',
      ],
      (_tx) => ({}), // No dynamic inputs needed for this test
    );

    const [
      ndjsonBasicContent,
      ndjsonLimitedContent,
      ndjsonToCsvContent,
      csvToNdjsonContent,
    ] = await Promise.all([
      getFileContent(result, 'out_ndjson_basic', driverKit),
      getFileContent(result, 'out_ndjson_limited', driverKit),
      getFileContent(result, 'out_ndjson_to_csv', driverKit),
      getFileContent(result, 'out_csv_to_ndjson', driverKit),
    ]);

    // Test all outputs
    expect(normalizeAndSortNdjson(ndjsonBasicContent)).toEqual(
      normalizeAndSortNdjson(expectedOutputNdjsonBasic),
    );
    expect(normalizeAndSortNdjson(ndjsonLimitedContent)).toEqual(
      normalizeAndSortNdjson(expectedOutputNdjsonLimited),
    );
    expect(normalizeCsv(ndjsonToCsvContent)).toEqual(
      normalizeCsv(expectedOutputNdjsonToCsv),
    );
    expect(normalizeAndSortNdjson(csvToNdjsonContent)).toEqual(
      normalizeAndSortNdjson(expectedOutputCsvToNdjson),
    );
  },
);
