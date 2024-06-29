export type AddParameters<
  TParameters extends [...args: any],
  TFunction extends (...args: any) => any
> = (
  ...args: [...TParameters, ...Parameters<TFunction>]
) => ReturnType<TFunction>;

export type AddParameterToAllMethods<Interface, TParameters extends [...args: any]> =
  {
    [Field in keyof Interface]:
    Interface[Field] extends (...args: any) => any
      ? AddParameters<TParameters, Interface[Field]>
      : Interface[Field]
  }
