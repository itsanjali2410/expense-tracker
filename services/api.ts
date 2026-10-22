
import { ApiError, GoogleGenAI, GenerateContentParameters, GenerateContentResponse, Part, Type } from "@google/genai";
import { CATEGORIES, Transaction } from "../types";
import { loadStatement, StatementContent } from "./ingest";
import { Analysis, weekOf } from "./analytics";

export { PasswordRequiredError } from "./ingest";

// Bump this whenever the API logic changes; it is shown in the footer and console
// so you can confirm which version is actually deployed.
export const API_VERSION = 'v6-daily-insights';
export const BUILD_TIME = process.env.BUILD_TIME || 'dev';

// Preview models are frequently overloaded (HTTP 503), so fall back to a stable model.
const MODELS = ['gemini-3-flash-preview', 'gemini-2.5-flash'];
const MAX_ATTEMPTS_PER_MODEL = 3;
const RETRYABLE_STATUSES = [429, 500, 503, 504];

console.info(`[api ${API_VERSION}] loaded, built ${BUILD_TIME}, models: ${MODELS.join(' -> ')}`);

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getClient = () => {
  if (!process.env.API_KEY) {
    throw new Error(`[${API_VERSION}] Gemini API key is missing from this build. Set GEMINI_API_KEY in the hosting environment variables and redeploy.`);
  }
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

const generateWithRetry = async (
  request: Omit<GenerateContentParameters, 'model'>
): Promise<GenerateContentResponse> => {
  const ai = getClient();
  let lastError: unknown;
  for (const model of MODELS) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_MODEL; attempt++) {
      try {
        console.info(`[api ${API_VERSION}] ${model} attempt ${attempt + 1}/${MAX_ATTEMPTS_PER_MODEL}`);
        const response = await ai.models.generateContent({ ...request, model });
        console.info(`[api ${API_VERSION}] ${model} succeeded`);
        return response;
      } catch (error) {
        lastError = error;
        const status = (error as ApiError)?.status;
        console.warn(`[api ${API_VERSION}] ${model} attempt ${attempt + 1} failed with status ${status ?? 'unknown'}`);
        if (!status || !RETRYABLE_STATUSES.includes(status)) {
          throw new Error(`[${API_VERSION}] Gemini request failed (${status ?? 'unknown'}): ${(error as Error)?.message}`);
        }
        if (attempt < MAX_ATTEMPTS_PER_MODEL - 1) {
          await sleep(1000 * 2 ** attempt + Math.random() * 500);
        }
      }
    }
  }
  console.error(`[api ${API_VERSION}] Gemini unavailable after retries on all models`, lastError);
  throw new Error(`[${API_VERSION}] Gemini AI is currently overloaded (503) on all models after retries. Please try again in a minute.`);
};

const toParts = (statement: StatementContent): Part[] => {
  switch (statement.kind) {
    case 'pdf':
      return [{ inlineData: { mimeType: 'application/pdf', data: statement.data } }];
    case 'text':
      return [{ text: `Bank statement text (personal details redacted, columns separated by two spaces):\n\n${statement.text}` }];
    case 'images':
      return statement.images.map(({ mimeType, data }) => ({ inlineData: { mimeType, data } }));
  }
};

const parseJson = <T,>(response: GenerateContentResponse, fallback: string): T => {
  try {
    return JSON.parse(response.text || fallback) as T;
  } catch (error) {
    console.error("Failed to parse Gemini response", error);
    throw new Error("The AI returned an unexpected format. Please try again.");
  }
};

export interface StatementResult {
  transactions: Transaction[];
  // Number of personal details removed before upload; null when the file could not be redacted.
  redactions: number | null;
}

// Throws PasswordRequiredError when the PDF is locked and no (or a wrong) password is given.
export const processStatement = async (file: File, password?: string): Promise<StatementResult> => {
  if (typeof window === 'undefined') {
    throw new Error("Cannot process file in a non-browser environment.");
  }

  const statement = await loadStatement(file, password);
  console.info(`[api ${API_VERSION}] sending statement to Gemini as ${statement.kind}, ${statement.redactions ?? 'no'} redactions`);

  const response = await generateWithRetry({
    contents: [
      {
        parts: [
          ...toParts(statement),
          {
            text: `Extract every individual transaction from this bank statement (it may be a PDF, CSV export or scanned image).

            For each transaction:
            - 'description': the raw text exactly as printed.
            - 'merchant': a clean, human-readable merchant or payee name. Strip terminal IDs, reference
              numbers, city codes and prefixes like POS/UPI/NEFT/IMPS/ACH. Example: "POS-98421-SWIGGY-BLR" -> "Swiggy",
              "UPI/DR/412345/UBER INDIA/..." -> "Uber". For transfers to people use the person's first name or "Transfer".
            - 'category': exactly one of: ${CATEGORIES.map(c => `'${c}'`).join(', ')}.

            Category guidelines:
            - 'Groceries': supermarkets and quick-commerce grocery apps (Blinkit, Zepto, BigBasket, Instamart).
            - 'Dining Out': restaurants and cafes. 'Food Delivery': Swiggy, Zomato, Uber Eats, DoorDash.
            - 'Transport': cabs, fuel, metro, parking, tolls (Uber, Ola, Rapido). 'Travel': flights, hotels, trips.
            - 'Rent': house rent. 'Debt & EMI': loan EMIs, credit card bill payments, BNPL repayments.
            - 'Utilities & Bills': electricity, water, gas, internet, phone recharges.
            - 'Subscriptions': recurring digital services (Netflix, Spotify, Prime, iCloud, gym memberships).
            - 'Electronics' (gadgets) and 'Clothing' (apparel, shoes) instead of generic shopping.
            - 'Bank Fees': charges, penalties, GST on fees, annual card fees, SMS charges.
            - 'Salary' for salary or income credits; 'Investments' for SIPs, mutual funds, stocks, deposits.
            - Ignore opening/closing balances and summary rows.
            - Return a clean JSON array of transaction objects.`,
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            date: { type: Type.STRING, description: "YYYY-MM-DD format" },
            description: { type: Type.STRING },
            merchant: { type: Type.STRING, description: "Clean merchant or payee name" },
            amount: { type: Type.NUMBER, description: "Absolute positive value" },
            type: { type: Type.STRING, enum: ["DEBIT", "CREDIT"] },
            category: { type: Type.STRING, enum: [...CATEGORIES] },
          },
          required: ["date", "description", "merchant", "amount", "type", "category"],
        },
      },
    },
  });

  const transactions = parseJson<any[]>(response, "[]").map((t, index) => ({
    ...t,
    id: `${t.date}-${index}-${Math.random().toString(36).substr(2, 9)}`,
    merchant: t.merchant || t.description,
    amount: Math.abs(t.amount),
  }));
  return { transactions, redactions: statement.redactions };
};

// Compact, aggregated view of the analysis that the AI narrates. Uses numbers already
// computed locally so the AI never has to do the arithmetic.
const describeAnalysis = (analysis: Analysis, format: (value: number) => string): string => {
  const weeks = analysis.weeks.map(w => {
    const top = Object.entries(w.categories).sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([category, amount]) => `${category} ${format(amount)}`).join(', ');
    const change = w.changePct === null ? '' : `, daily burn ${w.changePct >= 0 ? '+' : ''}${Math.round(w.changePct)}% vs previous week`;
    return `- ${w.label} (${w.range}): spent ${format(w.spend)} (${format(w.perDay)}/day${change}); needs ${format(w.buckets.need)}, wants ${format(w.buckets.want)}; top: ${top || 'none'}`;
  });
  const sinks = analysis.moneySinks.map(s => `- ${s.count} payments under ${format(analysis.microThreshold)} on ${s.category} totalling ${format(s.total)} (${s.merchants.join(', ')})`);
  const spikes = analysis.spikes.map(s => `- ${s.category} up ${Math.round(s.changePct)}% in ${s.week} vs ${s.prevWeek} (${format(s.amount)})`);
  const recurring = analysis.recurring.map(r => `- ${r.merchant}: ${r.kind}, ${r.count}x, ${format(r.total)}`);
  const { split, runway } = analysis;

  return [
    `Weeks (${analysis.mode === 'payday' ? 'aligned to payday' : 'calendar'}):`, ...weeks,
    `Income ${format(split.income)}; needs ${format(split.needs)}, wants ${format(split.wants)}, invested ${format(split.savings)}.`,
    runway ? `Runway (${runway.periodLabel}): Week 1-2 pace ${format(runway.pacePerDay)}/day projects ${format(runway.projectedSpend)} for 30 days, leaving ${format(runway.projectedLeft)}.` : '',
    sinks.length ? `Money sinks:\n${sinks.join('\n')}` : '',
    spikes.length ? `Spikes:\n${spikes.join('\n')}` : '',
    recurring.length ? `Recurring charges and fees:\n${recurring.join('\n')}` : '',
  ].filter(Boolean).join('\n');
};

export interface WeeklyInsights {
  debriefs: { week: string; bullets: string[] }[];
  suggestions: string[];
}

export const generateInsights = async (analysis: Analysis, format: (value: number) => string): Promise<WeeklyInsights> => {
  const response = await generateWithRetry({
    contents: [{
      parts: [{
        text: `You are a friendly personal-finance coach. Using ONLY the figures below, write:
        1. For every week, a debrief of exactly 3 short plain-English bullets explaining where the money went and any budget leaks.
           Use the exact week labels given.
        2. 3 actionable savings suggestions with concrete trade-offs and amounts
           (e.g. "Reducing weekend food delivery by 30% next week will balance out the Week 2 overspend").
        Keep each bullet under 25 words. Do not invent numbers.

        ${describeAnalysis(analysis, format)}`,
      }],
    }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          debriefs: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                week: { type: Type.STRING },
                bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ["week", "bullets"],
            },
          },
          suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["debriefs", "suggestions"],
      },
    },
  });
  return parseJson<WeeklyInsights>(response, '{"debriefs":[],"suggestions":[]}');
};

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export const askStatement = async (
  question: string,
  history: ChatMessage[],
  transactions: Transaction[],
  analysis: Analysis,
  format: (value: number) => string,
): Promise<string> => {
  const rows = transactions.map(t =>
    `${t.date} | ${weekOf(t.date, analysis.weeks)?.label ?? '-'} | ${t.merchant} | ${t.category} | ${t.type} | ${format(t.amount)}`);

  const response = await generateWithRetry({
    contents: [
      ...history.map(message => ({ role: message.role, parts: [{ text: message.text }] })),
      { role: 'user', parts: [{ text: question }] },
    ],
    config: {
      systemInstruction: `You answer questions about the user's bank statement. Use only the data below; if the answer
        is not in it, say so. Be brief and specific, quote amounts and dates. Plain text only, no markdown;
        use "- " for list items.

        SUMMARY:
        ${describeAnalysis(analysis, format)}

        TRANSACTIONS (date | week | merchant | category | type | amount):
        ${rows.join('\n')}`,
    },
  });
  return response.text?.trim() || "Sorry, I couldn't answer that. Try rephrasing the question.";
};
