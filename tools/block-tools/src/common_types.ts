import * as v from "valibot";

export const PlRegAddress = v.pipe(v.string(), v.regex(/^(?:s3:|file:)/));
