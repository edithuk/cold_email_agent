/**
 * lib/template.js
 * Template compiler and HTML-to-plain-text converter.
 * Mirrors frontend/src/utils/template.js so subject/body substitution
 * is identical on both sides.
 */

/**
 * Replaces <tag> / &lt;tag&gt; placeholders in `template` with values
 * derived from the contact row, column map, and any custom tags.
 *
 * @param {string} template   - Raw HTML/text template
 * @param {Object} row        - Contact object (CSV row)
 * @param {Object} colMap     - { name, email, company, role, … }
 * @param {string[]} customTags
 * @returns {string}
 */
function compileTemplate(template, row, colMap, customTags = []) {
  if (!template) return '';
  let result = template;

  const replaceTag = (tagName, value) => {
    if (value === undefined || value === null) return;
    const strVal = String(value);
    result = result
      .replace(new RegExp(`<${tagName}>`, 'gi'), strVal)
      .replace(new RegExp(`&lt;${tagName}&gt;`, 'gi'), strVal);
  };

  if (colMap) {
    Object.entries(colMap).forEach(([field, col]) => {
      if (col && row[col] !== undefined) replaceTag(field, row[col]);
    });
  }
  if (row) {
    Object.entries(row).forEach(([col, val]) => {
      const tag = col.toLowerCase().replace(/\s+/g, '_');
      replaceTag(tag, val ?? '');
      replaceTag(col, val ?? '');
    });
  }
  if (customTags && customTags.length) {
    customTags.forEach(tag => replaceTag(tag, ''));
  }

  // Strip any remaining un-replaced custom tags but preserve real HTML elements.
  const HTML_ELEMENTS = new Set([
    'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'cite', 'code', 'col',
    'colgroup', 'dd', 'del', 'details', 'dfn', 'fn', 'div', 'dl', 'dt', 'em',
    'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'head', 'header', 'hr', 'html', 'i', 'img', 'ins', 'kbd', 'label', 'li',
    'link', 'main', 'mark', 'meta', 'nav', 'ol', 'p', 'pre', 'q', 's',
    'samp', 'section', 'small', 'span', 'strong', 'style', 'sub', 'summary',
    'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'time', 'title',
    'tr', 'u', 'ul', 'var',
  ]);
  result = result.replace(/&lt;(\w+)&gt;/g, '');
  result = result.replace(/<(\w+)>/g, (match, tag) =>
    HTML_ELEMENTS.has(tag.toLowerCase()) ? match : ''
  );
  return result;
}

/**
 * Converts an HTML string to plain text suitable for the `text` part of an email.
 * @param {string} html
 * @returns {string}
 */
function htmlToText(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

module.exports = { compileTemplate, htmlToText };
