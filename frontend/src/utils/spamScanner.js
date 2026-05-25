/**
 * Spam Word Scanner & Deliverability Scoring Engine
 * Analyzes Subject Line and HTML Body client-side for deliverability signals.
 */

const SPAM_TRIGGERS = [
  "free", "guaranteed", "no catch", "winner", "risk free", "risk-free",
  "limited time", "act now", "make money", "100% satisfied", "earn money",
  "investment", "click here", "cash", "save big", "be your own boss",
  "urgent", "credit card", "cheap", "income", "extra cash", "billing",
  "financial freedom", "earn cash", "hidden charges", "payout", "double your",
  "unsecured debt", "miracle", "no strings attached", "opportunity", "cash bonus"
];

const OPT_OUT_PHRASES = [
  "unsubscribe", "opt out", "opt-out", "stop receiving", "remove me",
  "don't wish to hear", "rather not hear", "not interested", "not the right person",
  "please let me know", "remove from this list"
];

/**
 * Strips HTML tags and compiles raw text for word boundary analyses.
 */
function stripHtml(html) {
  if (!html) return "";
  // Replace typical block tags with spaces to avoid joining words
  let text = html.replace(/<\/?[^>]+(>|$)/g, " ");
  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  return text;
}

/**
 * Analyzes subject and body HTML to return score, grade, and feedback.
 */
export function analyzeTemplate(subject = "", bodyHtml = "") {
  const cleanSubject = subject.trim();
  const rawBodyText = stripHtml(bodyHtml).trim();
  
  let score = 100;
  const issues = [];
  const foundSpamWords = new Set();

  // If both subject and body are empty, return absolute baseline
  if (!cleanSubject && !rawBodyText) {
    return {
      score: 100,
      grade: "A",
      issues: [{ type: "info", msg: "Draft your email template to see a real-time deliverability score.", deduct: 0 }],
      foundSpamWords: [],
      wordCount: 0
    };
  }

  // 1. Opt-out Compliance Check
  if (rawBodyText) {
    const lowerBody = rawBodyText.toLowerCase();
    const hasOptOut = OPT_OUT_PHRASES.some(phrase => lowerBody.includes(phrase));
    if (!hasOptOut) {
      score -= 15;
      issues.push({
        type: "compliance",
        severity: "error",
        deduct: 15,
        msg: "Missing opt-out or unsubscribe notice.",
        fix: "Add a polite sign-off like 'If you would rather not hear from me, let me know.'"
      });
    }
  }

  // 2. Spam Word Scanner
  const combinedText = `${cleanSubject} ${rawBodyText}`.toLowerCase();
  SPAM_TRIGGERS.forEach(word => {
    // Exact word boundary matching for the phrase
    const regex = new RegExp(`\\b${word}\\b`, "i");
    if (regex.test(combinedText)) {
      foundSpamWords.add(word);
    }
  });

  if (foundSpamWords.size > 0) {
    const count = foundSpamWords.size;
    const deduction = Math.min(25, count * 5); // Max 25 pt deduction
    score -= deduction;
    issues.push({
      type: "spam-words",
      severity: count > 2 ? "error" : "warn",
      deduct: deduction,
      msg: `Found ${count} spam trigger word(s) in your template.`,
      fix: `Remove or rephrase these: ${Array.from(foundSpamWords).join(", ")}`
    });
  }

  // 3. Capitalization Check (ALL CAPS detection for words >= 5 chars, ignoring <TAGS>)
  // First strip tags like <company>, <name> etc. so custom uppercase tags don't trigger this
  const textWithoutTags = rawBodyText.replace(/<\w+>/g, "");
  const subjectWithoutTags = cleanSubject.replace(/<\w+>/g, "");
  
  const allCapsWords = [];
  const words = `${subjectWithoutTags} ${textWithoutTags}`.split(/\s+/);
  words.forEach(w => {
    // Clean word from punctuation
    const cleanWord = w.replace(/[^a-zA-Z]/g, "");
    if (cleanWord.length >= 5 && cleanWord === cleanWord.toUpperCase() && !/^[0-9]+$/.test(cleanWord)) {
      allCapsWords.push(cleanWord);
    }
  });

  if (allCapsWords.length > 0) {
    score -= 10;
    issues.push({
      type: "capitalization",
      severity: "warn",
      deduct: 10,
      msg: "Contains words in ALL CAPS (e.g., " + allCapsWords.slice(0, 3).join(", ") + ").",
      fix: "Convert words to lowercase or titlecase. Spam filters flag excessive shouting."
    });
  }

  // 4. Excessive Punctuation Check (consecutive !!! or ???)
  const fullTextWithPunc = `${cleanSubject} ${rawBodyText}`;
  if (/!{2,}/.test(fullTextWithPunc) || /\?{2,}/.test(fullTextWithPunc)) {
    score -= 10;
    issues.push({
      type: "punctuation",
      severity: "warn",
      deduct: 10,
      msg: "Excessive or consecutive punctuation (e.g. '!!!' or '???') detected.",
      fix: "Keep subject lines and body copy clean with standard single punctuation marks."
    });
  }

  // 5. Subject Line Length check
  if (cleanSubject) {
    const charLen = cleanSubject.length;
    const wordCount = cleanSubject.split(/\s+/).filter(Boolean).length;
    
    if (charLen > 65) {
      score -= 5;
      issues.push({
        type: "subject-len",
        severity: "warn",
        deduct: 5,
        msg: "Subject line is slightly too long (" + charLen + " characters).",
        fix: "Target under 60 characters so it is readable on mobile notifications."
      });
    } else if (wordCount < 2) {
      score -= 5;
      issues.push({
        type: "subject-len",
        severity: "warn",
        deduct: 5,
        msg: "Subject line is extremely short or blank.",
        fix: "Create an inviting subject line (2-5 words) to hook the recruiter."
      });
    }
  }

  // 6. Body length check
  const bodyWords = rawBodyText.split(/\s+/).filter(Boolean);
  const wordCount = bodyWords.length;
  if (wordCount > 0) {
    if (wordCount > 250) {
      score -= 10;
      issues.push({
        type: "body-len",
        severity: "warn",
        deduct: 10,
        msg: `Email is slightly too long (${wordCount} words).`,
        fix: "Try to keep recruiters cold outreach emails under 150-200 words for maximum impact."
      });
    } else if (wordCount < 20) {
      score -= 5;
      issues.push({
        type: "body-len",
        severity: "warn",
        deduct: 5,
        msg: `Email body is too brief (${wordCount} words).`,
        fix: "Introduce yourself, state your value proposition clearly, and add a call to action."
      });
    }
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  // Determine Letter Grade
  let grade = "A";
  if (score >= 90) grade = "A";
  else if (score >= 80) grade = "B";
  else if (score >= 70) grade = "C";
  else if (score >= 60) grade = "D";
  else grade = "F";

  return {
    score,
    grade,
    issues,
    foundSpamWords: Array.from(foundSpamWords),
    wordCount
  };
}
