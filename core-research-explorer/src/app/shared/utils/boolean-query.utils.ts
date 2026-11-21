export interface QueryValidation {
  valid: boolean;
  message: string | null;
}

export const MAX_BOOLEAN_QUERY_LENGTH = 500;

export function validateBooleanQuery(value: string): QueryValidation {
  const query = value.trim();
  if (!query) return { valid: false, message: 'Enter a search query.' };
  if (query.length > MAX_BOOLEAN_QUERY_LENGTH) {
    return {
      valid: false,
      message: `The query must be ${MAX_BOOLEAN_QUERY_LENGTH} characters or fewer.`,
    };
  }

  const quoteCount = (query.match(/"/g) ?? []).length;
  if (quoteCount % 2 !== 0) {
    return { valid: false, message: 'Close the open quotation mark.' };
  }

  if (/\($/.test(query)) {
    return { valid: false, message: 'Close the open parenthesis.' };
  }

  let depth = 0;
  let inQuotes = false;
  for (const character of query) {
    if (character === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (depth < 0) return { valid: false, message: 'The query contains unmatched parentheses.' };
  }
  if (depth !== 0) return { valid: false, message: 'The query contains unmatched parentheses.' };

  const unquoted = query.replace(/"[^"]*"/g, '""');

  if (/\(\s*\)/.test(unquoted)) {
    return { valid: false, message: 'The query contains empty parentheses.' };
  }

  if (
    /^(AND|OR)\b|\(\s*(AND|OR)\b|\b(AND|OR|NOT)\s*$|\b(AND|OR|NOT)\s*\)|\b(AND|OR)\s+(AND|OR)\b/i.test(
      unquoted,
    )
  ) {
    return { valid: false, message: 'The query ends or places an operator incorrectly.' };
  }

  return { valid: true, message: null };
}
