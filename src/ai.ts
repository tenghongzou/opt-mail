import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { Env } from './types';

// 分類選項（僅供提示；實際存字串，容忍模型微調用詞）
export const CATEGORIES = [
  '驗證碼/OTP',
  '帳單/交易',
  '系統通知',
  '電子報/行銷',
  '社交',
  '個人',
  '其他',
] as const;

// 結構化輸出 schema。category/score 用寬鬆型別，避免模型偶爾偏離導致整筆解析失敗。
const AnalysisSchema = z.object({
  summary: z.string().describe('用繁體中文寫一句話摘要這封信的重點'),
  category: z.string().describe(`從這些選其一：${CATEGORIES.join('、')}`),
  phishing_score: z.number().describe('釣魚/詐騙風險 0-100，數字越大越可疑'),
  phishing_reason: z.string().describe('若有風險，用繁體中文簡述原因；無風險留空字串'),
});

export type MailAnalysis = z.infer<typeof AnalysisSchema>;

const DEFAULT_MODEL = 'claude-opus-5';
const MAX_BODY_CHARS = 8000; // 截斷過長內文，控制成本與延遲

const SYSTEM_PROMPT = [
  '你是一次性信箱的進站信件分析助理。',
  '針對每封進站信，產出：一句話繁體中文摘要、分類、以及釣魚/詐騙風險評分。',
  '釣魚判斷可參考：偽冒知名品牌寄件網域、要求點連結輸入帳密/付款、製造急迫恐嚇語氣、',
  '寄件地址與宣稱身分不符、附帶可疑附件或短網址等。內容不足以判斷時給較低分數。',
  '只依信件內容判斷，不要臆測；務必用繁體中文輸出。',
].join('\n');

/**
 * 用 Claude 分析一封進站信。
 * 未設定 ANTHROPIC_API_KEY 或發生錯誤時回傳 null（呼叫端據此略過，不影響收信）。
 */
export async function analyzeEmail(
  env: Env,
  input: { from: string; subject: string; text: string },
): Promise<(MailAnalysis & { model: string }) | null> {
  if (!env.ANTHROPIC_API_KEY) return null;

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const model = env.AI_MODEL?.trim() || DEFAULT_MODEL;
  const body = (input.text || '').slice(0, MAX_BODY_CHARS);

  try {
    const res = await client.messages.parse({
      model,
      max_tokens: 2048,
      output_config: {
        format: zodOutputFormat(AnalysisSchema),
        effort: 'low', // 分類/摘要屬輕量任務，低 effort 兼顧速度與成本
      },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `寄件人：${input.from}\n主旨：${input.subject}\n\n內文：\n${body || '(無內文)'}`,
        },
      ],
    });

    const out = res.parsed_output;
    if (!out) return null;
    return {
      summary: out.summary,
      category: out.category,
      phishing_score: clampScore(out.phishing_score),
      phishing_reason: out.phishing_reason,
      model,
    };
  } catch (err) {
    console.error('AI analyze failed:', err);
    return null;
  }
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
