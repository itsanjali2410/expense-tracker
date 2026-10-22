import type { PDFDocumentProxy } from 'pdfjs-dist';
import { extractText, hasEnoughText, openPdf, PasswordRequiredError, renderPages, toBase64 } from './pdf';
import { redactPII } from './redact';

export { PasswordRequiredError };

export const ACCEPTED_FILES = 'application/pdf,.pdf,text/csv,.csv,image/png,image/jpeg';

// What gets sent to Gemini. `redactions` is null when the content could not be redacted
// locally (scans and unparseable PDFs are sent as-is for OCR).
export type StatementContent =
  | { kind: 'pdf'; data: string; redactions: null }
  | { kind: 'text'; text: string; redactions: number }
  | { kind: 'images'; images: { mimeType: string; data: string }[]; redactions: null };

const isCsv = (file: File) => file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv');
const isImage = (file: File) => file.type.startsWith('image/');
const isPdf = (file: File) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

export const isSupportedFile = (file: File) => isCsv(file) || isImage(file) || isPdf(file);

// Reads the statement in the browser. Passwords never leave the device, and text-based
// statements have personal data stripped before anything is sent to Gemini.
export const loadStatement = async (file: File, password?: string): Promise<StatementContent> => {
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (isCsv(file)) {
    const { text, count } = redactPII(new TextDecoder().decode(bytes));
    return { kind: 'text', text, redactions: count };
  }

  if (isImage(file)) {
    return { kind: 'images', images: [{ mimeType: file.type, data: toBase64(bytes) }], redactions: null };
  }

  let doc: PDFDocumentProxy;
  try {
    doc = await openPdf(bytes, password);
  } catch (error) {
    if (error instanceof PasswordRequiredError || password) throw error;
    // pdf.js couldn't parse it; let Gemini try the original file.
    return { kind: 'pdf', data: toBase64(bytes), redactions: null };
  }

  try {
    const rawText = await extractText(doc);
    if (hasEnoughText(rawText)) {
      const { text, count } = redactPII(rawText, { stripHeader: true });
      return { kind: 'text', text, redactions: count };
    }
    // Scanned statement: no text layer, so Gemini reads the page images (OCR).
    const pages = await renderPages(doc);
    return { kind: 'images', images: pages.map(data => ({ mimeType: 'image/jpeg', data })), redactions: null };
  } finally {
    await doc.loadingTask.destroy();
  }
};
