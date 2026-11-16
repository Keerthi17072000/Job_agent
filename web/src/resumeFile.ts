import { extractText, getDocumentProxy } from 'unpdf';
import mammoth from 'mammoth/mammoth.browser.js';

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const starts = (b: Uint8Array, s: string) => [...s].every((c, i) => b[i] === c.charCodeAt(0));

/** Reject oversized files and files whose real content does not match a supported type (the extension alone is not trusted). */
export async function checkResume(f: File): Promise<'pdf' | 'docx' | 'txt'> {
  if (f.size === 0) throw new Error('That file is empty.');
  if (f.size > MAX_RESUME_BYTES) throw new Error('That file is larger than 5 MB.');
  const ext = f.name.toLowerCase().split('.').pop() ?? '';
  const head = new Uint8Array(await f.slice(0, 8).arrayBuffer());
  if (ext === 'doc') throw new Error('Old .doc files are not supported. Save the resume as PDF, DOCX or TXT.');
  if (ext === 'pdf') { if (!starts(head, '%PDF')) throw new Error('That file is not a valid PDF.'); return 'pdf'; }
  if (ext === 'docx') { if (!starts(head, 'PK')) throw new Error('That file is not a valid DOCX.'); return 'docx'; }
  if (ext === 'txt') { if (head.includes(0)) throw new Error('That file is not plain text.'); return 'txt'; }
  throw new Error('Upload a PDF, DOCX or TXT resume.');
}

/** Resume file to plain text, inside the browser. The file never leaves this machine. */
export async function fileText(f: File): Promise<string> {
  const kind = await checkResume(f);
  const text = kind === 'pdf' ? (await extractText(await getDocumentProxy(new Uint8Array(await f.arrayBuffer())), { mergePages: true })).text
    : kind === 'docx' ? (await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() })).value : await f.text();
  if (text.trim().length < 20) throw new Error('No readable text was found in that file (scanned image PDFs are not supported).');
  return text;
}
