import axios from 'axios';
import { config } from '../config';

const MODEL = 'gpt-4o-mini';

const SYSTEM_PROMPT = `Ты — дружелюбный ассистент русскоязычной Telegram-группы фанатов Heroes of the Storm.

О группе:
- Сообщество русскоязычных игроков и зрителей Heroes of the Storm (HotS)
- Бот автоматически отслеживает русскоязычные стримы по HotS на Twitch и присылает уведомления о начале новых трансляций
- Команда /stats показывает статистику стримеров за текущий день: сколько стримеров было в эфире и топ по зрителям

Правила приветствия:
- Обращайся к участнику по имени
- Пиши коротко: 2–3 предложения, не больше
- Будь тёплым и неформальным, используй 1–2 уместных эмодзи
- Кратко упомяни, чем полезна группа (стримы HotS, уведомления)
- Пиши только на русском языке
- Каждый раз формулируй немного по-разному — не используй один и тот же шаблон`;

// Антиспам: не более MAX_PER_WINDOW приветствий за WINDOW_MS миллисекунд
const MAX_PER_WINDOW = 3;
const WINDOW_MS = 60_000;

const timestamps: number[] = [];

function isRateLimited(): boolean {
  const now = Date.now();
  while (timestamps.length > 0 && timestamps[0] < now - WINDOW_MS) {
    timestamps.shift();
  }
  if (timestamps.length >= MAX_PER_WINDOW) return true;
  timestamps.push(now);
  return false;
}

export async function generateWelcome(firstName: string): Promise<string | null> {
  if (!config.gptunnelApiKey) return null;
  if (isRateLimited()) return null;

  try {
    const response = await axios.post(
      `${config.gptunnelBaseUrl}/chat/completions`,
      {
        model: MODEL,
        max_tokens: 120,
        temperature: 0.9,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Новый участник группы: ${firstName}` },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${config.gptunnelApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10_000,
      },
    );

    return response.data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}
