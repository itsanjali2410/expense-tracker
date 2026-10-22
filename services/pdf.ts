import { getDocument, GlobalWorkerOptions, PasswordException, PasswordResponses, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

// Below this many characters we assume the PDF is scanned and needs OCR from page images.
const MIN_TEXT_LENGTH = 200;
const RENDER_SCALE = 1.5;

export class PasswordRequiredError extends Error {
  incorrect: boolean;

  constructor(incorrect: boolean) {
    super(incorrect ? 'Incorrect password. Please try again.' : 'This statement is password protected.');
    this.name = 'PasswordRequiredError';
    this.incorrect = incorrect;
  }
}

export const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

export const openPdf = async (bytes: Uint8Array, password?: string): Promise<PDFDocumentProxy> => {
  try {
    // pdf.js transfers the buffer to its worker, so give it a copy.
    return await getDocument({ data: bytes.slice(), password }).promise;
  } catch (error) {
    if (error instanceof PasswordException) {
      throw new PasswordRequiredError(error.code === PasswordResponses.INCORRECT_PASSWORD);
    }
    throw error;
  }
};

// Rebuilds each page line by line so table rows (date, description, amount) stay together.
export const extractText = async (doc: PDFDocumentProxy): Promise<string> => {
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const { items } = await page.getTextContent();
    const rows = new Map<number, { x: number; str: string }[]>();
    for (const item of items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const rowKey = Math.round(item.transform[5] / 3);
      rows.set(rowKey, [...(rows.get(rowKey) ?? []), { x: item.transform[4], str: item.str.trim() }]);
    }
    const lines = [...rows.entries()]
      .sort(([a], [b]) => b - a)
      .map(([, cells]) => cells.sort((a, b) => a.x - b.x).map(cell => cell.str).join('  '));
    pages.push(`--- Page ${pageNumber} ---\n${lines.join('\n')}`);
  }
  return pages.join('\n\n');
};

export const hasEnoughText = (text: string) => text.replace(/\s|--- Page \d+ ---/g, '').length >= MIN_TEXT_LENGTH;

export const renderPages = async (doc: PDFDocumentProxy): Promise<string[]> => {
  const images: string[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvas, viewport }).promise;
    images.push(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
  }
  return images;
};
