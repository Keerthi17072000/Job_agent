import { extractText, getDocumentProxy } from 'unpdf';
import mammoth from 'mammoth/mammoth.browser.js';

/** Resume file to plain text, inside the browser. The file never leaves this machine. */
export async function fileText(f: File): Promise<string> {
  const ext = f.name.toLowerCase().split('.').pop();
  if (ext === 'pdf') return (await extractText(await getDocumentProxy(new Uint8Array(await f.arrayBuffer())), { mergePages: true })).text;
  if (ext === 'docx') return (await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() })).value;
  if (ext === 'txt') return f.text();
  throw new Error('Upload a PDF, DOCX or TXT resume');
}
