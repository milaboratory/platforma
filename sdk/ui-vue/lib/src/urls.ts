import type { ParseQuery } from './types';

export const parsePathname = (href: `/${string}`) => {
  try {
    return new URL(href, 'http://dummy').pathname as `/${string}`;
  } catch (err) {
    console.error('Invalid href', href);
    return undefined;
  }
};

export const parseQuery = <Href extends `/${string}`>(href: Href) => {
  return Object.fromEntries(new URL(href, 'http://dummy').searchParams) as ParseQuery<Href>;
};
