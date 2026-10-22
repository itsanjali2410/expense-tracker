
import { ApiError, GoogleGenAI, GenerateContentParameters, GenerateContentResponse, Type } from "@google/genai";
import { Transaction } from "../types";

// Bump this whenever the API logic changes; it is shown in the footer and console
// so you can confirm which version is actually deployed.
export const API_VERSION = 'v2-retry-fallback';
export const BUILD_TIME = process.env.BUILD_TIME || 'dev';

// Preview models are frequently overloaded (HTTP 503), so fall back to a stable model.
const MODELS = ['gemini-3-flash-preview', 'gemini-2.5-flash'];
const MAX_ATTEMPTS_PER_MODEL = 3;
const RETRYABLE_STATUSES = [429, 500, 503, 504];

console.info(`[api ${API_VERSION}] loaded, built ${BUILD_TIME}, models: ${MODELS.join(' -> ')}`);

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const generateWithRetry = async (
  ai: GoogleGenAI,
  request: Omit<GenerateContentParameters, 'model'>
): Promise<GenerateContentResponse> => {
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

export const processStatement = async (file: File): Promise<Transaction[]> => {
  if (typeof window === 'undefined') {
    throw new Error("Cannot process file in a non-browser environment.");
  }

  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  if (!process.env.API_KEY) {
    throw new Error(`[${API_VERSION}] Gemini API key is missing from this build. Set GEMINI_API_KEY in the hosting environment variables and redeploy.`);
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const response = await generateWithRetry(ai, {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: base64Data,
            },
          },
          {
            text: `Extract every individual transaction from this bank statement. 
            
            Strictly categorize each into exactly one of these granular categories: 
            'Groceries', 'Dining Out', 'Electronics', 'Clothing', 'Travel', 'Healthcare', 
            'Education', 'Entertainment', 'Home Improvement', 'Utilities & Bills', 
            'Subscriptions', 'Salary', 'Investments', 'Bank Fees', 'Transfers', 'Misc'.
            
            Guidelines:
            - Break down 'Shopping' into 'Electronics' (gadgets, hardware) or 'Clothing' (apparel, shoes).
            - 'Groceries' are supermarket or food supply runs.
            - 'Dining Out' covers restaurants, cafes, and food delivery.
            - 'Utilities & Bills' includes electricity, water, internet, and phone.
            - 'Subscriptions' are recurring digital services (Netflix, Spotify, Amazon Prime).
            - Identify 'Salary' or 'Income' for credits.
            - Ignore balance carry-forwards or summary sections.
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
            amount: { type: Type.NUMBER, description: "Absolute positive value" },
            type: { type: Type.STRING, enum: ["DEBIT", "CREDIT"] },
            category: { type: Type.STRING, enum: [
              'Groceries', 'Dining Out', 'Electronics', 'Clothing', 'Travel', 'Healthcare', 
              'Education', 'Entertainment', 'Home Improvement', 'Utilities & Bills', 
              'Subscriptions', 'Salary', 'Investments', 'Bank Fees', 'Transfers', 'Misc'
            ]}
          },
          required: ["date", "description", "amount", "type", "category"],
        },
      },
    },
  });

  try {
    const rawText = response.text || "[]";
    const transactions = JSON.parse(rawText) as any[];
    return transactions.map((t, index) => ({
      ...t,
      id: `${t.date}-${index}-${Math.random().toString(36).substr(2, 9)}`,
      amount: Math.abs(t.amount),
    }));
  } catch (error) {
    console.error("Failed to parse Gemini response", error);
    throw new Error("Could not extract granular transactions from PDF. Invalid format.");
  }
};
