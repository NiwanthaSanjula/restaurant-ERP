
import type { KeyboardEvent } from 'react';

export const blockInvalidNumericChars = (
  e: KeyboardEvent<HTMLInputElement>
): void => {
  if (['e', 'E', '+', '-'].includes(e.key)) {
    e.preventDefault();
  }
};

export const blockInvalidNumericKeys = blockInvalidNumericChars;
