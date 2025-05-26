import { Pl } from '@milaboratories/pl-middle-layer';
import { awaitStableState, tplTest } from '@platforma-sdk/test';

tplTest(
  'pt simple test',
  { timeout: 20000 },
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

    const outputFileHandle = await awaitStableState(
      result.computeOutput('out', (fileHandle, ctx) => {
        if (!fileHandle) {
          return undefined;
        }
        return driverKit.blobDriver.getOnDemandBlob(fileHandle.persist(), ctx).handle;
      }),
      15000,
    );

    expect(outputFileHandle).toBeDefined();

    const outputTsvContent = (await driverKit.blobDriver.getContent(outputFileHandle!)).toString();

    const normalizeTsv = (str: string) => str.replace(/\r\n/g, '\n').trim();

    expect(normalizeTsv(outputTsvContent)).toEqual(normalizeTsv(expectedOutputTsvData));
  },
);

tplTest(
  'pt ex1 test - window and groupBy operations',
  { timeout: 30000 }, // Increased timeout for potentially more complex operations
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

    const getFileContent = async (outputName: 'out_windows' | 'out_grouped') => {
      const fileHandle = await awaitStableState(
        result.computeOutput(outputName, (fileHandle, ctx) => {
          if (!fileHandle) {
            return undefined;
          }
          return driverKit.blobDriver.getOnDemandBlob(fileHandle.persist(), ctx).handle;
        }),
        25000, // Allow more time for ptabler execution
      );
      expect(fileHandle).toBeDefined();
      return (await driverKit.blobDriver.getContent(fileHandle!)).toString();
    };

    const outputWindowsContent = await getFileContent('out_windows');
    const outputGroupedContent = await getFileContent('out_grouped');

    const normalizeAndSortTsv = (str: string) => {
      const lines = str.replace(/\r\n/g, '\n').trim().split('\n');
      const header = lines.shift();
      lines.sort();
      return [header, ...lines].join('\n');
    };

    expect(normalizeAndSortTsv(outputWindowsContent)).toEqual(normalizeAndSortTsv(expectedOutputWindowsTsvData));
    expect(normalizeAndSortTsv(outputGroupedContent)).toEqual(normalizeAndSortTsv(expectedOutputGroupedTsvData));
  },
);

tplTest(
  'pt ex2 test - filter and sort operations',
  { timeout: 30000 },
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

    const getFileContent = async (outputName: 'out_filtered_sorted') => {
      const fileHandle = await awaitStableState(
        result.computeOutput(outputName, (fileHandle, ctx) => {
          if (!fileHandle) {
            return undefined;
          }
          return driverKit.blobDriver.getOnDemandBlob(fileHandle.persist(), ctx).handle;
        }),
        25000,
      );
      expect(fileHandle).toBeDefined();
      return (await driverKit.blobDriver.getContent(fileHandle!)).toString();
    };

    const outputContent = await getFileContent('out_filtered_sorted');

    const normalizeAndSortTsv = (str: string) => {
      const lines = str.replace(/\r\n/g, '\n').trim().split('\n');
      const header = lines.shift();
      // Data is already sorted by the template, so just join
      return [header, ...lines].join('\n');
    };

    const normalizeTsv = (str: string) => str.replace(/\r\n/g, '\n').trim();

    expect(normalizeTsv(outputContent)).toEqual(normalizeTsv(expectedOutputTsvData));
  },
);

tplTest(
  'pt ex3 test - join operations',
  { timeout: 40000 }, // Increased timeout for multiple PTabler steps
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
      (tx) => ({}), // No dynamic inputs needed for this test
    );

    const getFileContentLocal = async (
      outputName: 
        | 'out_inner_join' 
        | 'out_left_join_on' 
        | 'out_full_join_on_nocoalesce' 
        | 'out_cross_join',
    ) => {
      const fileHandle = await awaitStableState(
        result.computeOutput(outputName, (fileHandle, ctx) => {
          if (!fileHandle) {
            return undefined;
          }
          return driverKit.blobDriver.getOnDemandBlob(fileHandle.persist(), ctx).handle;
        }),
        35000, // Allow more time for ptabler execution with multiple joins
      );
      expect(fileHandle).toBeDefined();
      return (await driverKit.blobDriver.getContent(fileHandle!)).toString();
    };

    const normalizeTsv = (str: string) => str.replace(/\r\n/g, '\n').trim();
    const normalizeAndSortTsv = (str: string) => {
      const lines = str.replace(/\r\n/g, '\n').trim().split('\n');
      const header = lines.shift();
      lines.sort(); // Sort data lines for consistent comparison
      return [header, ...lines].join('\n');
    };

    const outputInnerJoin = await getFileContentLocal('out_inner_join');
    expect(normalizeAndSortTsv(outputInnerJoin)).toEqual(normalizeAndSortTsv(expectedOutputInnerJoin));

    const outputLeftJoinOn = await getFileContentLocal('out_left_join_on');
    expect(normalizeAndSortTsv(outputLeftJoinOn)).toEqual(normalizeAndSortTsv(expectedOutputLeftJoinOn));

    const outputFullJoinOnNoCoalesce = await getFileContentLocal('out_full_join_on_nocoalesce');
    expect(normalizeAndSortTsv(outputFullJoinOnNoCoalesce)).toEqual(normalizeAndSortTsv(expectedOutputFullJoinOnNoCoalesce));

    const outputCrossJoin = await getFileContentLocal('out_cross_join');
    expect(normalizeAndSortTsv(outputCrossJoin)).toEqual(normalizeAndSortTsv(expectedOutputCrossJoin));
  },
);
