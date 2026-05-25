/**
 * Compile a template string by replacing all <tagName> placeholders
 * with values from the contact row.
 *
 * Supports:
 *  - Standard mapped columns: name, email, company, role (via colMap)
 *  - Any additional CSV column headers (used as-is, case-insensitive matching)
 *  - Custom user-defined tags not tied to CSV columns (must be pre-filled)
 *
 * Handles both raw `<tag>` and Quill-HTML-encoded `&lt;tag&gt;` forms.
 *
 * @param {string} template  – HTML or plain-text template string
 * @param {object} row       – Contact row (key = column header, value = cell value)
 * @param {object} colMap    – { name, email, company, role } → column header names
 * @param {string[]} extraTags – Additional custom tag names (defined by user, no CSV column)
 * @returns {string}
 */
export function compileTemplate(template, row = {}, colMap = {}, extraTags = []) {
  let out = template;

  const replace = (tagName, value) => {
    if (value === undefined || value === null) return;
    const raw     = `<${tagName}>`;
    const encoded = `&lt;${tagName}&gt;`;
    out = out.replaceAll(raw, String(value)).replaceAll(encoded, String(value));
  };

  // 1. Standard mapped fields
  const standards = ['name', 'email', 'company', 'role'];
  for (const field of standards) {
    if (colMap[field] && row[colMap[field]] !== undefined) {
      replace(field, row[colMap[field]]);
    }
  }

  // 2. All remaining CSV column headers as tags (lowercased, spaces→underscores)
  for (const [col, value] of Object.entries(row)) {
    const tag = col.toLowerCase().replace(/\s+/g, '_');
    replace(tag, value);
    // Also support the original column name exactly (preserving case)
    replace(col, value);
  }

  // 3. Custom user-defined tags (these won't have a CSV source, so just skip if unresolved)
  // They will already be handled if the user added them with a matching CSV column name,
  // or they stay as-is in the output.

  return out;
}

/** Format HH:MM:SS from a Date object */
export function formatTime(date = new Date()) {
  return date.toTimeString().slice(0, 8);
}

/** Sleep utility */
export function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}
