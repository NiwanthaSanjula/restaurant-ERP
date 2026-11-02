const validator = require('validator');

const email = 'contactqdesk@gmail.com';
const normalized = validator.normalizeEmail(email);
console.log(`Original: "${email}"`);
console.log(`Normalized: "${normalized}"`);
