declare const __brand: unique symbol;
type Brand<B> = { [__brand]: B }

export type Branded<T, B> = T & Brand<B>

export type LocalBlobHandle = Branded<string, 'LocalBlobHandle'>
export type RemoteBlobHandle = Branded<string, 'RemoteBlobHandle'>
