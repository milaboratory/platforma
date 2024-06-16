export type Cfg =
  | CfgGetFromCtx

  | CfgIsolate

  | CfgImmediate

  | CfgMakeObject
  | CfgMakeArray

  | CfgGetJsonField
  | CfgMapRecordValues
  | CfgMapArrayValues

  | CfgFlatten

  | CfgIsEmpty
  | CfgNot
  | CfgAnd
  | CfgOr

  | CfgMapResourceFields
  | CfgGetResourceField
  | CfgResourceValueAsJson

  | CfgBlobContent
  | CfgBlobContentAsString
  | CfgBlobContentAsJson;

//
// Isolate / Rendering Mode
//

/** Forces wrapped config to be rendered asynchronously, using its own
 * rendering cell */
export type CfgIsolate = {
  type: 'Isolate'
  cfg: Cfg
}

//
// Context
//

export type CfgGetFromCtx = {
  type: 'GetFromCtx'
  variable: string
}

//
// Json
//

export type CfgImmediate = {
  type: 'Immediate'
  value: any
}

export type CfgGetJsonField = {
  type: 'GetJsonField'
  source: Cfg
  field: Cfg
}

export type CfgMakeObject = {
  type: 'MakeObject'
  template: Record<string, Cfg>
}

export type CfgMakeArray = {
  type: 'MakeArray'
  template: Cfg[]
}

export type CfgMapRecordValues = {
  type: 'MapRecordValues'
  source: Cfg
  itVar: string
  mapping: Cfg
}

export type CfgMapArrayValues = {
  type: 'MapArrayValues'
  source: Cfg
  itVar: string
  mapping: Cfg
}

export type CfgFlatten = {
  type: 'Flatten'
  source: Cfg
}

//
// Boolean
//

export type CfgIsEmpty = {
  type: 'IsEmpty'
  arg: Cfg
}

export type CfgNot = {
  type: 'Not'
  operand: Cfg
}

export type CfgAnd = {
  type: 'And'
  operand1: Cfg,
  operand2: Cfg
}

export type CfgOr = {
  type: 'Or'
  operand1: Cfg,
  operand2: Cfg,
}

//
// Resources
//

export type CfgMapResourceFields = {
  type: 'MapResourceFields'
  source: Cfg
  itVar: string
  mapping: Cfg
}

export type CfgGetResourceField = {
  type: 'GetResourceField'
  source: Cfg
  field: Cfg
}

export type CfgResourceValueAsJson = {
  type: 'GetResourceValueAsJson'
  source: Cfg
}

//
// Download Blobs
//

export type CfgBlobContent = {
  type: 'GetBlobContent'
  source: Cfg
}

export type CfgBlobContentAsString = {
  type: 'GetBlobContentAsString'
  source: Cfg
}

export type CfgBlobContentAsJson = {
  type: 'GetBlobContentAsJson'
  source: Cfg
}
