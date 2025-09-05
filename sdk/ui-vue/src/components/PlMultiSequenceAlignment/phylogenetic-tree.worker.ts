import rapidnj from '@milaboratories/biowasm-tools/rapidnj';

addEventListener(
  'message',
  async ({ data }: MessageEvent<RequestMessage>) => {
    try {
      postMessage(await onMessage(data));
    } catch (error) {
      reportError(error);
    }
  },
);

export type RequestMessage = string[];

export type ResponseMessage = TreeNodeData[];

async function onMessage(sequences: RequestMessage): Promise<ResponseMessage> {
  if (sequences.length < 2) {
    throw new Error(
      'Cannot build phylogenetic tree for less than 2 sequences.',
    );
  }
  const input = sequences
    .map((sequence, index) => `>${index}\n${sequence}`)
    .join('\n');
  const output = await rapidnj(input);
  return Array.from(parseRapidnjOutput(output));
}

function parseRapidnjOutput(input: string) {
  let prevIndex = 0;
  const root = new TreeNode();
  let node = root;
  let virtualId = -1;
  for (const match of input.matchAll(/[(,);]/g)) {
    const [token] = match;
    const [id, length] = input.slice(prevIndex, match.index).split(':');
    if (id) node.id = Number(id.slice(1, -1));
    if (length) node.length = Number(length);
    node.id ??= virtualId--;
    switch (token) {
      case '(':
        node = node.newChild();
        break;
      case ',':
        node = node.parent!.newChild();
        break;
      case ')':
        node = node.parent!;
        break;
      case ';':
        return root;
    }
    prevIndex = match.index + 1;
  }
  throw new Error('Missing semicolon.');
}

class TreeNode {
  id?: number;
  length?: number;
  parent?: TreeNode;
  children?: TreeNode[];

  newChild(): TreeNode {
    const node = new TreeNode();
    node.parent = this;
    (this.children ??= []).push(node);
    return node;
  }

  *[Symbol.iterator](): Generator<TreeNodeData> {
    if (this.id === undefined) {
      throw new Error('Node ID cannot be undefined.');
    }
    const result: TreeNodeData = { id: this.id };
    if (this.length !== undefined) result.length = this.length;
    if (this.parent) result.parentId = this.parent.id;
    yield result;
    for (const child of this.children ?? []) yield * child;
  }
}

export interface TreeNodeData {
  id: number;
  length?: number;
  parentId?: number;
}
