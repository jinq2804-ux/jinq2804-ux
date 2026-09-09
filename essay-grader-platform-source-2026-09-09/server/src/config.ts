import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');

export const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'essay-grader-dev-secret-change-me',
  jwtExpiresIn: '7d',
  dataDir: process.env.DATA_DIR || path.join(serverRoot, 'data'),
  dataFile: process.env.DATA_FILE || path.join(serverRoot, 'data', 'db.json'),
  clientDist: process.env.CLIENT_DIST || path.resolve(serverRoot, '..', 'client', 'dist'),
  aiMode: (process.env.AI_MODE || 'auto') as 'auto' | 'mock' | 'deepseek',
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  enableWebSearch: process.env.ENABLE_WEB_SEARCH === 'true',
};
