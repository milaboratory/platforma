import { TestTags } from "@milaboratories/build-configs";
import { request } from "undici";
import { test } from "vitest";
import { defaultHttpDispatcher } from ".";

test("simple http request", { tags: [TestTags.Flaky] }, async ({ expect }) => {
  const dispatcher = defaultHttpDispatcher();
  const response = await request(
    "https://blocks.pl-open.science/v2/milaboratories/repertoire-diversity/overview.json",
    {
      dispatcher: dispatcher,
    },
  );
  const responseBody = (await response.body.json()) as any;
  expect(responseBody?.versions?.length).toBeGreaterThan(1);
});
