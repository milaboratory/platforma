export type Cfg =
  | CfgImmediate
  | CfgGetJsonField
  | CfgGetFromCtx
  | CfgMakeObject
  | CfgMapRecordValues
  | CfgMapArray
  | CfgMapResourceFields
  | CfgGetResourceField
  | CfgResourceValueAsJson;

export type CfgImmediate = {
  type: 'Immediate'
  value: any
}

export type CfgGetJsonField = {
  type: 'GetJsonField'
  source: Cfg
  field: Cfg
}

export type CfgGetFromCtx = {
  type: 'GetFromCtx'
  variable: string
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

export type CfgMapArray = {
  type: 'MapArray'
  source: Cfg
  itVar: string
  mapping: Cfg
}

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
