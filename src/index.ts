import { app } from './app';
import { handleEmail } from './email';
import type { Env } from './types';

// 同一個 Worker 掛兩個 handler：
//   fetch → Dashboard / API
//   email → Cloudflare Email Routing 進站信件
export default {
  fetch: app.fetch,
  email: handleEmail,
} satisfies ExportedHandler<Env>;
