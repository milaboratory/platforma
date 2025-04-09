type Brand<B, K extends string = '__pl_model_brand__'> = { [key in K]: B };

export type Branded<T, B, K extends string = '__pl_model_brand__'> = T & Brand<B, K>;
