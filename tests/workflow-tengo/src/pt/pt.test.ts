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
