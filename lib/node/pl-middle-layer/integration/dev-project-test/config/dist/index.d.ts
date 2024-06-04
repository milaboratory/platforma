import { Option, Ref, ResolveOutputsType } from '@milaboratory/sdk-block-config';
export type BlockInputs = {
    sources: Ref[];
};
export declare const config: import("@milaboratory/sdk-block-config").BlockConfig<BlockInputs, undefined, {
    dependsOnBlocks: import("@milaboratory/sdk-block-config").TypedConfig<import("@milaboratory/sdk-block-config").GetResourceValueAsJson<import("@milaboratory/sdk-block-config").GetResourceField<import("@milaboratory/sdk-block-config").GetFromCtx<"$staging">, import("@milaboratory/sdk-block-config").GetImmediate<"dependsOnBlocks">>, string[]>>;
} & {
    opts: import("@milaboratory/sdk-block-config").TypedConfig<import("@milaboratory/sdk-block-config").MapArrayValues<import("@milaboratory/sdk-block-config").GetResourceValueAsJson<import("@milaboratory/sdk-block-config").GetResourceField<import("@milaboratory/sdk-block-config").GetFromCtx<"$staging">, import("@milaboratory/sdk-block-config").GetImmediate<"opts">>, Option[]>, import("@milaboratory/sdk-block-config").MakeObject<{
        readonly ref: import("@milaboratory/sdk-block-config").MakeObject<{
            readonly __isRef: import("@milaboratory/sdk-block-config").GetImmediate<true>;
            readonly blockId: import("@milaboratory/sdk-block-config").GetField<import("@milaboratory/sdk-block-config").GetField<import("@milaboratory/sdk-block-config").GetFromCtx<"$it">, import("@milaboratory/sdk-block-config").GetImmediate<"ref">>, import("@milaboratory/sdk-block-config").GetImmediate<"blockId">>;
            readonly name: import("@milaboratory/sdk-block-config").GetField<import("@milaboratory/sdk-block-config").GetField<import("@milaboratory/sdk-block-config").GetFromCtx<"$it">, import("@milaboratory/sdk-block-config").GetImmediate<"ref">>, import("@milaboratory/sdk-block-config").GetImmediate<"name">>;
        }>;
        readonly label: import("@milaboratory/sdk-block-config").GetField<import("@milaboratory/sdk-block-config").GetFromCtx<"$it">, import("@milaboratory/sdk-block-config").GetImmediate<"label">>;
    }>, "$it">>;
} & {
    sum: import("@milaboratory/sdk-block-config").TypedConfig<import("@milaboratory/sdk-block-config").GetResourceValueAsJson<import("@milaboratory/sdk-block-config").GetResourceField<import("@milaboratory/sdk-block-config").GetFromCtx<"$prod">, import("@milaboratory/sdk-block-config").GetImmediate<"sum">>, number>>;
}>;
export type OutputType = ResolveOutputsType<typeof config>;
