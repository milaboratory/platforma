import { computed, type MaybeRefOrGetter, toValue } from "vue";

export function useFilteredItems<T>(
  props: MaybeRefOrGetter<{
    items: T[];
    query: string;
    getStrings: (item: T) => Iterable<string>;
  }>,
) {
  const result = computed(() => {
    const { items, query, getStrings } = toValue(props);
    const filteredItems: T[] = [];
    const segments = new Map<string, StringSegment[]>();
    for (const item of items) {
      let kept = false;
      for (const string of getStrings(item)) {
        let stringSegments = segments.get(string);
        if (!stringSegments) {
          stringSegments = matchSubstrings(string, query);
          segments.set(string, stringSegments);
        }
        if (!kept && (!query || stringSegments.some(({ match }) => match))) {
          filteredItems.push(item);
          kept = true;
        }
      }
    }
    return { filteredItems, segments };
  });
  return {
    filteredItems: computed(() => result.value.filteredItems),
    segments: computed(() => result.value.segments),
  };
}

// Very naïve implementation of substring matching, doesn't handle Unicode well
// Maybe one day we'll have nice things: https://github.com/tc39/ecma402/issues/506
function matchSubstrings(haystack: string, needle: string): StringSegment[] {
  if (!needle) return [{ value: haystack, match: false }];
  const haystackLower = haystack.toLowerCase();
  const needleLower = needle.toLowerCase();
  const result: StringSegment[] = [];
  let prevEnd = 0;
  while (true) {
    const start = haystackLower.indexOf(needleLower, prevEnd);
    const end = start + needle.length;
    if (start < 0) break;
    if (prevEnd !== start) {
      result.push({ value: haystack.slice(prevEnd, start), match: false });
    }
    const prevSegment = result.at(-1);
    if (prevSegment?.match) {
      prevSegment.value += haystack.slice(start, end);
    } else {
      result.push({ value: haystack.slice(start, end), match: true });
    }
    prevEnd = end;
  }
  if (prevEnd < haystack.length) {
    result.push({ value: haystack.slice(prevEnd), match: false });
  }
  return result;
}

type StringSegment = {
  value: string;
  match: boolean;
};
