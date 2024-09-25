import {
  ContentAbsoluteUrl,
  ContentAnyLocal,
  ContentExplicitOrRelative,
  ContentRelative
} from './content_types';

export function mapRemoteToAbsolute(
  rootUrl: string
): <T extends ContentAnyLocal>(value: T) => Exclude<T, ContentRelative> | ContentAbsoluteUrl {
  const rootWithSlash = rootUrl.endsWith('/') ? rootUrl : `${rootUrl}/`;
  return <T extends ContentAnyLocal>(value: T) =>
    value.type === 'relative'
      ? { type: 'absolute-url', url: rootWithSlash + value.path }
      : (value as Exclude<T, ContentRelative>);
}

/**
 * Creates transformer of relative content paths, that adds a specific prefix to the relative path.
 *
 * If prefix = "nested-path/", paths like "somefile.txt" will be transformed to "nested-path/somefile.txt".
 *
 * @param prefix prefix to add to the relaive path, slesh at the end will be added automatically if missed
 */
export function addPrefixToRelative(
  prefix: string
): <T extends ContentExplicitOrRelative>(value: T) => T {
  const prefixWithSlash = prefix.endsWith('/') ? prefix : `${prefix}/`;
  return <T extends ContentExplicitOrRelative>(value: T) =>
    (value.type === 'relative'
      ? { type: 'relative', path: prefixWithSlash + value.path }
      : value) as T;
}
