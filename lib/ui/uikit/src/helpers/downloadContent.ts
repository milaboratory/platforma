type MimeType =
  | 'text/plain'
  | 'text/html'
  | 'text/css'
  | 'text/javascript'
  | 'text/csv'
  | 'application/json'
  | 'application/xml'
  | 'application/pdf'
  | 'application/zip'
  | 'application/octet-stream'
  | 'image/png'
  | 'image/jpeg'
  | 'image/gif'
  | 'image/svg+xml'
  | 'audio/mpeg'
  | 'audio/wav'
  | 'video/mp4'
  | 'video/webm'
  | (string & {});

type DownloadableContent =
  | [string, MimeType]
  | [Blob, MimeType]
  | [ArrayBuffer, MimeType]
  | [Uint8Array, MimeType]
  | [Int8Array, MimeType]
  | [Uint16Array, MimeType]
  | [Int16Array, MimeType]
  | [Uint32Array, MimeType]
  | [Int32Array, MimeType]
  | [Float32Array, MimeType]
  | [Float64Array, MimeType]
  | [DataView, MimeType]
  | Blob // Blob already has mimeType
  | File; // File already has mimeType

export const downloadContent = (content: DownloadableContent, filename: string) => {
  let blob: Blob;

  if (content instanceof Blob) {
    blob = content;
  } else if (content instanceof File) {
    blob = content;
  } else if (Array.isArray(content) && content.length === 2) {
    const [data, mimeType] = content;
    if (typeof data === 'string') {
      blob = new Blob([data], { type: mimeType });
    } else if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      blob = new Blob([data], { type: mimeType });
    } else if (data instanceof Blob) {
      blob = new Blob([data], { type: mimeType });
    } else {
      blob = new Blob([String(data)], { type: mimeType });
    }
  } else {
    throw new Error('Invalid content type. Content must be a Blob, File, or [data, mimeType] tuple.');
  }

  const objectUrl = URL.createObjectURL(blob);

  try {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    throw new Error(`Failed to download ${filename}: ${error}`);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};
