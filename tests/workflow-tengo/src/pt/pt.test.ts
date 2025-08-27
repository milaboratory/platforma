import { Pl } from '@milaboratories/pl-middle-layer';
import { awaitStableState, tplTest } from '@platforma-sdk/test';
import { expect } from 'vitest';
import type { TestRenderResults } from '@platforma-sdk/test';
import type { MiddleLayerDriverKit } from '@milaboratories/pl-middle-layer';
import type { PlTreeNodeAccessor } from '@milaboratories/pl-tree';
import type { ComputableCtx } from '@milaboratories/computable';

const getFileContent = async (
  result: TestRenderResults<string>,
  outputName: string,
  driverKit: MiddleLayerDriverKit,
  timeout = 40000,
): Promise<string> => {
  const handle = await awaitStableState(
    result.computeOutput(outputName, (fileHandle: PlTreeNodeAccessor | undefined, ctx: ComputableCtx) => {
      if (!fileHandle) return undefined;
      return driverKit.blobDriver.getOnDemandBlob(fileHandle.persist(), ctx).handle;
    }),
    timeout,
  );
  expect(handle).toBeDefined();
  return (await driverKit.blobDriver.getContent(handle!)).toString();
};

const normalizeTsv = (str: string) => str.replace(/\r\n/g, '\n').trim();

const normalizeAndSortTsv = (str: string) => {
  const lines = str.replace(/\r\n/g, '\n').trim().split('\n');
  const header = lines.shift();
  lines.sort();
  return [header, ...lines].join('\n');
};

const normalizeNdjson = (str: string) =>
  str
    .replace(/\r\n/g, '\n')
    .trim()
    .split('\n')
    .map((line) => {
      // Parse and re-stringify to normalize JSON formatting
      try {
        return JSON.stringify(JSON.parse(line));
      } catch {
        return line; // Return as-is if not valid JSON
      }
    })
    .sort() // Sort lines for consistent comparison
    .join('\n');

tplTest.concurrent(
  'pt simple test',
  async ({ helper, expect, driverKit }) => {
    const inputTsvData = 'a\tb\n1\tX\n4\tY\n9\tZ';
    const expectedOutputTsvData = 'a\ta_sqrt\n1\t1.0\n4\t2.0\n9\t3.0';

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
  'pt ex1 test - window and groupBy operations',
  async ({ helper, expect, driverKit }) => {
    const inputTsvData = `category\tuser_id\tscore\tvalue
A\tuser1\t100\t10
A\tuser2\t150\t20
B\tuser3\t200\t30
A\tuser4\t120\t5
B\tuser5\t180\t25
C\tuser6\t300\t50`;

    const expectedOutputWindowsTsvData = `category\tuser_id\tscore\tvalue\tcategory_sum_value\trank_in_category
A\tuser1\t100\t10\t35\t3
A\tuser2\t150\t20\t35\t1
A\tuser4\t120\t5\t35\t2
B\tuser3\t200\t30\t55\t1
B\tuser5\t180\t25\t55\t2
C\tuser6\t300\t50\t50\t1`;

    const expectedOutputGroupedTsvData = `category\ttotal_value_by_cat\tavg_score_by_cat
A\t35\t123.33333333333333
B\t55\t190.0
C\t50\t300.0`;

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
  'pt ex2 test - filter and sort operations',
  async ({ helper, expect, driverKit }) => {
    const inputTsvData = `category\tuser_id\tscore\tvalue
A\tuser1\t100\t10
A\tuser2\t150\t120
B\tuser3\t200\t130
A\tuser4\t120\t105
B\tuser5\t180\t25
C\tuser6\t300\t150
B\tuser7\t190\t110`;

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
    const expectedOutputTsvData = `category\tuser_id\tscore\tvalue
A\tuser2\t150\t120
A\tuser4\t120\t105
B\tuser3\t200\t130
B\tuser7\t190\t110`;

    const result = await helper.renderTemplate(
      false,
      'pt.ex2',
      ['out_filtered_sorted'],
      (tx) => ({
        inputTsv: tx.createValue(Pl.JsonObject, JSON.stringify(inputTsvData)),
      }),
    );

    const outputContent = await getFileContent(result, 'out_filtered_sorted', driverKit);

    expect(normalizeTsv(outputContent)).toEqual(normalizeTsv(expectedOutputTsvData));
  },
);

tplTest.concurrent(
  'pt ex3 test - join operations',
  async ({ helper, expect, driverKit }) => {
    // No input files needed as data is defined in the template as strings

    const expectedOutputInnerJoin = `id,name,val_left,name_from_right,val_right,info_for_test1
1,Alice,100,Alice_R1,10,R_Info_1
2,Bob,200,Bob_R1,20,R_Info_2
4,David,400,David_R1,40,R_Info_4`;

    // dfLeft: id,name,val_left (1,Alice,100; 2,Bob,200; 3,Charlie,300; 4,David,400)
    // dfRight: id_r,name,val_right,info (ID1,Alice,10; ID2,Bob,20; ID4,David,40; ID5,Frank,50)
    // Joining on 'name'
    const expectedOutputLeftJoinOn = `id,name,val_left,id_from_right,val_right,info
1,Alice,100,ID1,10,R_Info_Alice
2,Bob,200,ID2,20,R_Info_Bob
3,Charlie,300,,,
4,David,400,ID4,40,R_Info_David`; // David is in both
    // Frank from right is not included due to left join

    // dfLeftOn: common_key,name_l,val_l (K1,Alice_LO,100; K2,Bob_LO,200; K3,Charlie_LO,300)
    // dfRightOn: common_key,name_r,val_r (K1,Andrea_RO,10; K2,Robert_RO,20; K4,David_RO,400)
    // Joining on 'common_key' with coalesce=false
    // Polars default for coalesce=false on full join with common key names like 'common_key'
    // will create 'common_key' (from left) and 'common_key_right' (from right)
    const expectedOutputFullJoinOnNoCoalesce = `common_key,name_l,common_key_right,name_r
K1,Alice_LO,K1,Andrea_RO
K2,Bob_LO,K2,Robert_RO
K3,Charlie_LO,,
,,K4,David_RO`; // K3 only in left, K4 only in right

    // dfCrossLeft: item_id,item_name (L1,Apple; L2,Banana)
    // dfCrossRight: color_id,color_name (C1,Red; C2,Yellow)
    const expectedOutputCrossJoin = `item_name,item_color
Apple,Red
Apple,Yellow
Banana,Red
Banana,Yellow`;

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
    const inputTsvData = `text\tstart\tlen\tend
HelloWorld\t0\t5\t5
AnotherTest\t2\t4\t6
Short\t1\t10\t11`;

    const expectedOutputSubstrLen = `text\tsub
HelloWorld\tHello
AnotherTest\tothe
Short\thort`;

    const expectedOutputSubstrEnd = `text\tsub
HelloWorld\tHello
AnotherTest\tothe
Short\thort`;

    const expectedOutputSubstrStatic = `text\tsub
HelloWorld\tello
AnotherTest\tnoth
Short\thort`;

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

    const expectedOutputStringFunctions = `email\tfilename\tcontent\tcode\thas_email_pattern\tcontains_apple_literal\tcontains_hello_ci\thas_citrus\thas_fruits_ci\tcount_letter_a\tword_count\tusername\tdomain\tcode_letters\tstarts_with_john\tis_data_file\tis_pdf\tis_dot_com
john.doe@example.com\tdocument.pdf\tThis contains apple and banana fruits\tHELLO123\ttrue\ttrue\ttrue\tfalse\ttrue\t6\t6\tjohn.doe\texample.com\tHELLO\ttrue\tfalse\ttrue\ttrue
jane_smith@test.org\timage.jpg\tLooking for orange or lemon juice\thello456\ttrue\tfalse\ttrue\ttrue\tfalse\t1\t6\tjane_smith\ttest.org\thello\tfalse\tfalse\tfalse\tfalse
bob@company.co.uk\tdata.csv\tNo fruits here just vegetables\tGOODBYE789\ttrue\tfalse\tfalse\tfalse\tfalse\t1\t5\tbob\tcompany.co.uk\tGOODBYE\tfalse\ttrue\tfalse\tfalse
alice.wilson@demo.net\treadme.txt\tApple pie and cherry tart available\tworld999\ttrue\tfalse\tfalse\tfalse\ttrue\t5\t6\talice.wilson\tdemo.net\tworld\tfalse\tfalse\tfalse\tfalse
frank@startup.io\tscript.py\tBanana smoothie with lime juice\ttest888\ttrue\tfalse\tfalse\ttrue\ttrue\t3\t5\tfrank\tstartup.io\ttest\tfalse\tfalse\tfalse\tfalse`;

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
    const expectedOutputNdjsonBasic = `{"id":1,"name":"Alice","score":95.5,"active":true,"score_bonus":105.5}
{"id":2,"name":"Bob","score":87.2,"active":false,"score_bonus":97.2}
{"id":3,"name":"Charlie","score":92.1,"active":true,"score_bonus":102.1}
{"id":4,"name":"Diana","score":98.7,"active":true,"score_bonus":108.7}
{"id":5,"name":"Eve","score":83.4,"active":false,"score_bonus":93.4}`;

    // Expected NDJSON output with nRows=3 and filtered for active=true
    // Note: Only first 3 rows are read due to nRows limit, then filtered for active=true
    const expectedOutputNdjsonLimited = `{"id":1,"name":"Alice","score":95.5,"active":true}
{"id":3,"name":"Charlie","score":92.1,"active":true}`;

    // Expected CSV output sorted by score (descending)
    const expectedOutputNdjsonToCsv = `id,name,score,active
4,Diana,98.7,true
1,Alice,95.5,true
3,Charlie,92.1,true
2,Bob,87.2,false
5,Eve,83.4,false`;

    // Expected NDJSON output from CSV input with enriched columns
    const expectedOutputCsvToNdjson = `{"id":1,"display_name":"Alice (1)","score":95.5,"active":true,"high_performer":true}
{"id":2,"display_name":"Bob (2)","score":87.2,"active":false,"high_performer":false}
{"id":3,"display_name":"Charlie (3)","score":92.1,"active":true,"high_performer":true}`;

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

    // Helper functions for normalization
    const normalizeCsv = (str: string) => str.replace(/\r\n/g, '\n').trim();

    // Test all outputs
    expect(normalizeNdjson(ndjsonBasicContent)).toEqual(
      normalizeNdjson(expectedOutputNdjsonBasic),
    );
    expect(normalizeNdjson(ndjsonLimitedContent)).toEqual(
      normalizeNdjson(expectedOutputNdjsonLimited),
    );
    expect(normalizeCsv(ndjsonToCsvContent)).toEqual(
      normalizeCsv(expectedOutputNdjsonToCsv),
    );
    expect(normalizeNdjson(csvToNdjsonContent)).toEqual(
      normalizeNdjson(expectedOutputCsvToNdjson),
    );
  },
);
