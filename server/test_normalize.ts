import { normalizeEmail } from 'validator';

const email = 'contactqdesk@gmail.com';
const normalized = normalizeEmail(email);
console.log(`Original: "${email}"`);
console.log(`Normalized: "${normalized}"`);
