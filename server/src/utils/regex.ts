/**
 * Escape special regex characters
 */
export const escapeRegExp = (string: string): string => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Create a flexible regex pattern that matches strings with optional whitespace between characters
 * Case-insensitive matching
 * @param string The input string to create regex for
 * @returns RegExp object that matches the pattern
 */
export const createFlexibleRegex = (string: string): RegExp => {
  const cleanString = string.trim().replace(/\s+/g, '');
  const regexPattern = cleanString.split('').map(char => escapeRegExp(char)).join('\\s*');
  return new RegExp(`^${regexPattern}$`, 'i');
};
