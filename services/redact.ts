// Strips personal data from statement text before it is sent to Gemini. Runs entirely in
// the browser. Payee names inside transaction descriptions are kept, since they are needed
// for merchant detection.

const DATE = /\b\d{1,2}[/\-. ](\d{1,2}|[A-Za-z]{3})[/\-. ]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/;
const AMOUNT = /\d[\d,]*\.\d{2}\b/;
const PERSONAL_LABEL = /\b(name|address|customer\s*id|cif|nominee|mobile|phone|e-?mail|pan|aadhaar|dob|date of birth)\b/i;
const COLUMN_HEADER = /\b(debit|credit|withdrawal|deposit|balance|amount|narration|particulars|description)\b/i;

const PATTERNS: [RegExp, (match: string) => string][] = [
  [/\b[\w.+-]+@[\w-]+\.[a-z]{2,}(\.[a-z]{2,})?\b/gi, () => '[EMAIL]'],
  [/\b[\w.-]+@[a-z]{2,}\b/gi, () => '[UPI-ID]'],
  [/\b[A-Z]{5}\d{4}[A-Z]\b/g, () => '[PAN]'],
  [/\b\d{4}([ -])\d{4}\1\d{4}\1\d{4}\b/g, () => '[CARD]'],
  [/\b\d{4} \d{4} \d{4}\b/g, () => '[ID]'],
  // Account, card, phone and reference numbers: keep the last 4 digits.
  [/\b\d{9,18}\b(?!\.\d)/g, match => `XXXX${match.slice(-4)}`],
];

const isTransactionLine = (line: string) => DATE.test(line) && AMOUNT.test(line);
const isColumnHeader = (line: string) => /\bdate\b/i.test(line) && COLUMN_HEADER.test(line) && !PERSONAL_LABEL.test(line);

export interface RedactionResult {
  text: string;
  count: number;
}

// `stripHeader` drops everything before the first transaction row on the first page, which
// is where PDF statements print the account holder's name and address.
export const redactPII = (text: string, { stripHeader = false } = {}): RedactionResult => {
  let count = 0;
  const lines = text.split('\n');
  const firstTransaction = lines.findIndex(isTransactionLine);

  const cleaned = lines.map((line, index) => {
    const isLayoutLine = !line.trim() || line.startsWith('--- Page');
    const inHeader = stripHeader && firstTransaction > 0 && index < firstTransaction;
    if (!isLayoutLine && !isColumnHeader(line) && (inHeader || (PERSONAL_LABEL.test(line) && !isTransactionLine(line)))) {
      count++;
      return '[REDACTED LINE]';
    }
    return PATTERNS.reduce((result, [pattern, replace]) => result.replace(pattern, match => {
      count++;
      return replace(match);
    }), line);
  });

  return { text: cleaned.join('\n'), count };
};
