declare type TemplateFromFile = { readonly type: "from-file"; readonly path: string; };
declare type TplName = "pframes.aggregate" | "pframes.export-single-pcolumn" | "pframes.import-dir" | "pframes.map-pframe" | "workdir.save" | "workflow.build-ctx" | "exec.create-python-venv" | "exec.exec" | "pframes.export-multiple-pcolumns" | "pframes.export-pframe" | "pframes.import-xsv-map";
declare const Templates: Record<TplName, TemplateFromFile>;
export { Templates };
