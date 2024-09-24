export type Arranged = {
  fileName: string
  filePath: string
  Sample: string
  R: string
  tags: {
    [key: string]: string
  } | null
  valid: boolean
  hasMatch: boolean
};
