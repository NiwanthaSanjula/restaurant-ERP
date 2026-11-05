export const hostedPortfolio = () => process.env.VERCEL === '1' || process.env.PORTFOLIO_HOSTED_MODE === '1';
export const HOSTED_FILE_MESSAGE = 'File uploads, logo deletion and customer imports are disabled in the hosted portfolio. Approved images are bundled; use local development for file changes.';
