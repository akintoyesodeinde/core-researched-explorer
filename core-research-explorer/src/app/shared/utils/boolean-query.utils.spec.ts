import { MAX_BOOLEAN_QUERY_LENGTH, validateBooleanQuery } from './boolean-query.utils';

describe('validateBooleanQuery', () => {
  it('accepts the example Boolean query', () => {
    expect(validateBooleanQuery('drone AND (package OR delivery)').valid).toBe(true);
  });

  it('accepts normal terms ending with letters that match operator names', () => {
    expect(validateBooleanQuery('sensor').valid).toBe(true);
    expect(validateBooleanQuery('quadrotor').valid).toBe(true);
    expect(validateBooleanQuery('broadband').valid).toBe(true);
    expect(validateBooleanQuery('knot').valid).toBe(true);
    expect(validateBooleanQuery('drone AND sensor').valid).toBe(true);
  });

  it('accepts quoted phrases and fielded queries', () => {
    expect(validateBooleanQuery('abstract:"drone delivery" AND sensor').valid).toBe(true);
    expect(validateBooleanQuery('"command and control"').valid).toBe(true);
  });

  it('rejects empty input', () => {
    expect(validateBooleanQuery('   ').valid).toBe(false);
  });

  it('rejects queries exceeding the maximum allowed length', () => {
    const oversized = 'a'.repeat(MAX_BOOLEAN_QUERY_LENGTH + 1);
    const result = validateBooleanQuery(oversized);
    expect(result.valid).toBe(false);
    expect(result.message).toContain(String(MAX_BOOLEAN_QUERY_LENGTH));
  });

  it('rejects unmatched parentheses', () => {
    expect(validateBooleanQuery('drone AND (delivery').valid).toBe(false);
  });

  it('rejects empty parentheses', () => {
    const result = validateBooleanQuery('drone AND ()');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('empty parentheses');
  });

  it('rejects unmatched quotation marks', () => {
    const result = validateBooleanQuery('abstract:"drone delivery');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('quotation mark');
  });

  it('rejects leading binary operators', () => {
    expect(validateBooleanQuery('AND drone').valid).toBe(false);
    expect(validateBooleanQuery('OR delivery').valid).toBe(false);
    expect(validateBooleanQuery('(AND delivery)').valid).toBe(false);
  });

  it('rejects consecutive binary operators', () => {
    expect(validateBooleanQuery('drone AND OR delivery').valid).toBe(false);
    expect(validateBooleanQuery('drone OR AND delivery').valid).toBe(false);
  });

  it('rejects trailing operators', () => {
    expect(validateBooleanQuery('drone AND').valid).toBe(false);
    expect(validateBooleanQuery('drone NOT').valid).toBe(false);
  });

  it('rejects operators placed beside closing or opening parentheses', () => {
    expect(validateBooleanQuery('(drone AND) OR delivery').valid).toBe(false);
  });

  it('rejects unmatched closing parentheses', () => {
    expect(validateBooleanQuery('drone AND delivery)').valid).toBe(false);
  });

  it('allows NOT, AND NOT, and nested parentheses', () => {
    expect(validateBooleanQuery('NOT drone AND (delivery OR package)').valid).toBe(true);
    expect(validateBooleanQuery('drone AND NOT military').valid).toBe(true);
  });
});
