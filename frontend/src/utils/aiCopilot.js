/**
 * aiCopilot.js — Provider-agnostic AI client for DripFlow's Cold Email Copilot.
 *
 * Supports:
 *   VITE_AI_PROVIDER=gemini  → Google Generative Language API
 *   VITE_AI_PROVIDER=groq    → Groq OpenAI-compatible API
 *
 * Switch providers by changing VITE_AI_PROVIDER in .env.local — no code changes needed.
 */

// ── Provider config read from env vars ─────────────────────────────────────
const PROVIDER = (import.meta.env.VITE_AI_PROVIDER || 'gemini').toLowerCase();

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.0-flash';

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || '';
const GROQ_MODEL = import.meta.env.VITE_GROQ_MODEL || 'llama-3.3-70b-versatile';

// ── Low-level API callers ───────────────────────────────────────────────────

async function callGemini(systemPrompt, userPrompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
        },
      ],
      generationConfig: {
        temperature: 0.85,
        maxOutputTokens: 1024,
      },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini API error: ${res.status}`);
  }
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function callGroq(systemPrompt, userPrompt) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.85,
      max_tokens: 1024,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Groq API error: ${res.status}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

/**
 * Route prompt to the active provider.
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @returns {Promise<string>} Raw text response from the model.
 */
async function callAI(systemPrompt, userPrompt) {
  if (PROVIDER === 'groq') return callGroq(systemPrompt, userPrompt);
  return callGemini(systemPrompt, userPrompt);
}

// ── Shared JSON extractor ───────────────────────────────────────────────────

/**
 * Strips markdown code fences and parses JSON from model output.
 * Handles ```json ... ``` and raw JSON alike.
 */
function parseJson(raw) {
  const clean = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  return JSON.parse(clean);
}

// ── Available tags helper (used in prompt injection) ────────────────────────

function buildTagList(customTags = [], headers = []) {
  const coreTags = ['name', 'email', 'company', 'role'];
  const csvTags = headers.map(h => h.toLowerCase().replace(/\s+/g, '_'));
  return [...new Set([...coreTags, ...csvTags, ...customTags])];
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate a complete cold email (subject + HTML body) from context.
 *
 * @param {{ context: string, targetRole: string, tone: string, customTags: string[], headers: string[], stageLabel: string }} params
 * @returns {Promise<{ subject: string, body: string }>}
 */
export async function generateEmail({ context, targetRole, tone, customTags = [], headers = [], stageLabel = 'Initial Email' }) {
  const tags = buildTagList(customTags, headers);

  const systemPrompt = `You are an expert B2B outreach copywriter who writes highly personalized, high-converting cold emails.
You MUST return ONLY valid JSON in this exact shape — no markdown fences, no extra text:
{"subject":"...","body":"..."}
The body must be formatted as HTML (use <p> tags for paragraphs, <br> for line breaks). Keep it under 180 words.
You MUST use dynamic tag chips from this list wherever they naturally fit: ${tags.map(t => `<${t}>`).join(', ')}.
Tone: ${tone}. Email stage: ${stageLabel}.`;

  const userPrompt = `Context / Campaign Goal: ${context}
Target Recipient Role: ${targetRole}
Write a compelling ${stageLabel.toLowerCase()} email in a ${tone.toLowerCase()} tone.`;

  const raw = await callAI(systemPrompt, userPrompt);
  return parseJson(raw);
}

/**
 * Rewrite / polish an existing email draft.
 *
 * @param {{ subject: string, body: string, mode: 'punchier' | 'shorter' | 'grammar' }} params
 * @returns {Promise<{ subject: string, body: string }>}
 */
export async function rewriteEmail({ subject, body, mode }) {
  const modeInstructions = {
    punchier: 'Make the email more energetic, direct and impactful. Use shorter sentences. Open with a strong hook. Keep the same structure but punch up the language.',
    shorter: 'Shorten the email for mobile reading. Aim for under 100 words in the body. Cut anything that is not absolutely essential. Keep every dynamic <tag> chip intact.',
    grammar: 'Fix all grammar, spelling, punctuation and flow issues. Improve sentence clarity. Do not change the meaning or structure.',
  };

  const systemPrompt = `You are an expert email editor. ${modeInstructions[mode] || modeInstructions.grammar}
Return ONLY valid JSON with this exact shape — no markdown, no extra text:
{"subject":"...","body":"..."}
The body must be HTML (use <p> tags). Preserve all <tag> chips exactly as they appear.`;

  const userPrompt = `Subject: ${subject}\n\nBody:\n${body}`;

  const raw = await callAI(systemPrompt, userPrompt);
  return parseJson(raw);
}

/**
 * Generate 5 high-converting subject lines from an email body.
 *
 * @param {{ body: string, targetRole?: string }} params
 * @returns {Promise<string[]>} Array of 5 subject line strings.
 */
export async function generateSubjectLines({ body, targetRole = '' }) {
  const systemPrompt = `You are an expert email subject line copywriter specialising in cold outreach with high open rates.
Generate exactly 5 compelling, diverse subject lines for the email below.
Each subject line should be unique in style (e.g., curiosity gap, personalized, social proof, direct, question).
Return ONLY a valid JSON array of 5 strings — no markdown, no extra text.
Example: ["Subject 1","Subject 2","Subject 3","Subject 4","Subject 5"]
Preserve any <tag> chips (e.g., <name>, <company>) that make sense in a subject line.`;

  const userPrompt = `Target role: ${targetRole || 'professional'}\n\nEmail body:\n${body}`;

  const raw = await callAI(systemPrompt, userPrompt);
  return parseJson(raw);
}

/**
 * Returns a human-readable label for the currently active AI provider.
 * Useful for displaying in the UI.
 */
export function getProviderLabel() {
  if (PROVIDER === 'groq') return `Groq · ${GROQ_MODEL}`;
  return `Gemini · ${GEMINI_MODEL}`;
}

/**
 * Returns true if the active provider has an API key configured.
 */
export function isAiConfigured() {
  if (PROVIDER === 'groq') return Boolean(GROQ_API_KEY);
  return Boolean(GEMINI_API_KEY);
}
