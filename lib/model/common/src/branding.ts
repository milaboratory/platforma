type Brand<B> = { __pl_model_brand__: B };

export type Branded<T, B> = T & Brand<B>;
