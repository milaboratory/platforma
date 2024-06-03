export type Cfg =
  | CfgGetFromCtx

  | CfgImmediate
  | CfgGetJsonField
  | CfgMakeObject
  | CfgMapRecordValues
  | CfgMapArrayValues

  | CfgIsEmpty
  | CfgNot

  | CfgMapResourceFields
  | CfgGetResourceField
  | CfgResourceValueAsJson;

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
