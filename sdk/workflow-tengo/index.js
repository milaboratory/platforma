module.exports = { Templates: {
  'pframes.aggregate': { type: 'from-file', path: require.resolve('./dist/tengo/tpl/pframes.aggregate.plj.gz') },
  'pframes.export-single-pcolumn': { type: 'from-file', path: require.resolve('./dist/tengo/tpl/pframes.export-single-pcolumn.plj.gz') },
  'pframes.import-dir': { type: 'from-file', path: require.resolve('./dist/tengo/tpl/pframes.import-dir.plj.gz') },
  'pframes.map-pframe': { type: 'from-file', path: require.resolve('./dist/tengo/tpl/pframes.map-pframe.plj.gz') },
  'workdir.save': { type: 'from-file', path: require.resolve('./dist/tengo/tpl/workdir.save.plj.gz') },
  'workflow.build-ctx': { type: 'from-file', path: require.resolve('./dist/tengo/tpl/workflow.build-ctx.plj.gz') },
  'exec.create-python-venv': { type: 'from-file', path: require.resolve('./dist/tengo/tpl/exec.create-python-venv.plj.gz') },
  'exec.exec': { type: 'from-file', path: require.resolve('./dist/tengo/tpl/exec.exec.plj.gz') },
  'pframes.export-multiple-pcolumns': { type: 'from-file', path: require.resolve('./dist/tengo/tpl/pframes.export-multiple-pcolumns.plj.gz') },
  'pframes.export-pframe': { type: 'from-file', path: require.resolve('./dist/tengo/tpl/pframes.export-pframe.plj.gz') },
  'pframes.import-xsv-map': { type: 'from-file', path: require.resolve('./dist/tengo/tpl/pframes.import-xsv-map.plj.gz') }
}}
