type Cfg =
  | CfgImmediate
  | CfgGetJsonField
  | CfgGetFromCtx
  | CfgMakeObject
  | CfgMapRecordValues
  | CfgMapArray
  | CfgMapResourceFields
  | CfgGetResourceField
  | CfgResourceValueAsJson;

type CfgImmediate = {
  type: 'Immediate'
  value: any
}

type CfgGetJsonField = {
  type: 'GetJsonField'
  source: Cfg
  field: Cfg
}

type CfgGetFromCtx = {
  type: 'GetFromCtx'
  variable: string
}

type CfgMakeObject = {
  type: 'MakeObject'
  template: Record<string, Cfg>
}

type CfgMapRecordValues = {
  type: 'MapRecordValues'
  source: Cfg
  itVar: string
  mapping: Cfg
}

type CfgMapArray = {
  type: 'MapArray'
  source: Cfg
  itVar: string
  mapping: Cfg
}

type CfgMapResourceFields = {
  type: 'MapResourceFields'
  source: Cfg
  itVar: string
  mapping: Cfg
}

type CfgGetResourceField = {
  type: 'GetResourceField'
  source: Cfg
  field: Cfg
}

type CfgResourceValueAsJson = {
  type: 'GetResourceValueAsJson'
  source: Cfg
}
