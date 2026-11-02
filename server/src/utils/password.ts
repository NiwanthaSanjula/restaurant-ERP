import crypto from 'crypto';

const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const NUMBERS = '0123456789';
const ALL = `${UPPERCASE}${LOWERCASE}${NUMBERS}`;

const pickChar = (charset: string): string => charset[crypto.randomInt(0, charset.length)];

const shuffle = (chars: string[]): string[] => {
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars;
};

export const generateTemporaryPassword = (length = 12): string => {
  const finalLength = Math.max(12, length);
  const chars = [
    pickChar(UPPERCASE),
    pickChar(LOWERCASE),
    pickChar(NUMBERS),
    pickChar(UPPERCASE)
  ];

  while (chars.length < finalLength) {
    chars.push(pickChar(ALL));
  }

  return shuffle(chars).join('');
};
