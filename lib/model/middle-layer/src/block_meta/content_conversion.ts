import { ContentAbsoluteUrl, ContentAnyLocal, ContentRelative } from "./content_types";

export function mapRemoteToAbsolute(
  rootUrl: string
): <T extends ContentAnyLocal>(
  value: T
) => Exclude<T, ContentRelative> | ContentAbsoluteUrl {
  const rootWithSlash = rootUrl.endsWith('/') ? rootUrl : `${rootUrl}/`;
  return <T extends ContentAnyLocal>(value: T) =>
    value.type === 'relative'
      ? { type: 'absolute-url', url: rootWithSlash + value.path }
      : (value as Exclude<T, ContentRelative>);
}
