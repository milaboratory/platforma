export type TxStat = {
  txCount: number;

  rootsCreated: number;
  structsCreated: number;
  structsCreatedDataBytes: number;
  ephemeralsCreated: number;
  ephemeralsCreatedDataBytes: number;
  valuesCreated: number;
  valuesCreatedDataBytes: number;

  kvSetRequests: number;
  kvSetBytes: number;

  inputsLocked: number;
  outputsLocked: number;
  fieldsCreated: number;
  fieldsSet: number;
  fieldsGet: number;

  rGetDataCacheHits: number;
  rGetDataCacheFields: number;
  rGetDataCacheBytes: number;
  rGetDataNetRequests: number;
  rGetDataNetFields: number;
  rGetDataNetBytes: number;

  kvListRequests: number;
  kvListEntries: number;
  kvListBytes: number;

  kvGetRequests: number;
  kvGetBytes: number;
};

export function initialTxStat(): TxStat {
  return {
    txCount: 0,
    rootsCreated: 0,
    structsCreated: 0,
    structsCreatedDataBytes: 0,
    ephemeralsCreated: 0,
    ephemeralsCreatedDataBytes: 0,
    valuesCreated: 0,
    valuesCreatedDataBytes: 0,
    kvSetRequests: 0,
    kvSetBytes: 0,
    inputsLocked: 0,
    outputsLocked: 0,
    fieldsCreated: 0,
    fieldsSet: 0,
    fieldsGet: 0,
    rGetDataCacheHits: 0,
    rGetDataCacheFields: 0,
    rGetDataCacheBytes: 0,
    rGetDataNetRequests: 0,
    rGetDataNetFields: 0,
    rGetDataNetBytes: 0,
    kvListRequests: 0,
    kvListEntries: 0,
    kvListBytes: 0,
    kvGetRequests: 0,
    kvGetBytes: 0
  };
}

export function addStat(a: TxStat, b: TxStat): TxStat {
  return {
    txCount: a.txCount + b.txCount,
    rootsCreated: a.rootsCreated + b.rootsCreated,
    structsCreated: a.structsCreated + b.structsCreated,
    structsCreatedDataBytes: a.structsCreatedDataBytes + b.structsCreatedDataBytes,
    ephemeralsCreated: a.ephemeralsCreated + b.ephemeralsCreated,
    ephemeralsCreatedDataBytes: a.ephemeralsCreatedDataBytes + b.ephemeralsCreatedDataBytes,
    valuesCreated: a.valuesCreated + b.valuesCreated,
    valuesCreatedDataBytes: a.valuesCreatedDataBytes + b.valuesCreatedDataBytes,
    kvSetRequests: a.kvSetRequests + b.kvSetRequests,
    kvSetBytes: a.kvSetBytes + b.kvSetBytes,
    inputsLocked: a.inputsLocked + b.inputsLocked,
    outputsLocked: a.outputsLocked + b.outputsLocked,
    fieldsCreated: a.fieldsCreated + b.fieldsCreated,
    fieldsSet: a.fieldsSet + b.fieldsSet,
    fieldsGet: a.fieldsGet + b.fieldsGet,
    rGetDataCacheHits: a.rGetDataCacheHits + b.rGetDataCacheHits,
    rGetDataCacheFields: a.rGetDataCacheFields + b.rGetDataCacheFields,
    rGetDataCacheBytes: a.rGetDataCacheBytes + b.rGetDataCacheBytes,
    rGetDataNetRequests: a.rGetDataNetRequests + b.rGetDataNetRequests,
    rGetDataNetFields: a.rGetDataNetFields + b.rGetDataNetFields,
    rGetDataNetBytes: a.rGetDataNetBytes + b.rGetDataNetBytes,
    kvListRequests: a.kvListRequests + b.kvListRequests,
    kvListEntries: a.kvListEntries + b.kvListEntries,
    kvListBytes: a.kvListBytes + b.kvListBytes,
    kvGetRequests: a.kvGetRequests + b.kvGetRequests,
    kvGetBytes: a.kvGetBytes + b.kvGetBytes
  };
}

export type AllTxStat = {
  committed: TxStat;
  conflict: TxStat;
  error: TxStat;
};
