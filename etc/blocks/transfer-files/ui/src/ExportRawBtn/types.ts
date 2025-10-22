export type ExportItem = {
  fileName: string;
  current: number;
  size: number;
  status: 'pending' | 'in-progress' | 'completed';
};

export type ExportsMap = Map<string, ExportItem>;
