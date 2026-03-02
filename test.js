// Тест логики без внешних зависимостей (Twitch/Telegram API не нужны)
// Запуск: node test.js

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ': ' + detail : ''}`);
    failed++;
  }
}

// ─── formatter ────────────────────────────────────────────────────────────────
console.log('\nformatter.ts');
const fmt = require('./dist/telegram/formatter');

// formatStreamMessage
const mockStream = {
  id: '123',
  user_login: 'testuser',
  user_name: 'TestUser',
  game_name: 'Heroes of the Storm',
  title: 'Test <stream> & more',
  viewer_count: 1234,
  started_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
  thumbnail_url: 'https://example.com/{width}x{height}.jpg',
  tags: ['Russian', 'Heroes of the Storm', 'MOBA'],
  is_mature: false,
};

const streamMsg = fmt.formatStreamMessage(mockStream, null);
assert('formatStreamMessage содержит имя стримера',     streamMsg.includes('TestUser'));
assert('formatStreamMessage содержит ссылку',           streamMsg.includes('https://twitch.tv/testuser'));
assert('formatStreamMessage экранирует HTML в заголовке', streamMsg.includes('&lt;stream&gt;') && streamMsg.includes('&amp;'));
assert('formatStreamMessage содержит зрителей',         streamMsg.includes('1'));
assert('formatStreamMessage содержит #heroesofthestorm', streamMsg.includes('#heroesofthestorm'));

// Теги — хэштеги
assert('теги: Russian → #Russian',               streamMsg.includes('#Russian'));
assert('теги: Heroes of the Storm → #HeroesoftheStorm', streamMsg.includes('#HeroesoftheStorm'));
assert('теги: MOBA → #MOBA',                     streamMsg.includes('#MOBA'));
assert('теги: пробелы убраны (нет пустых #)',    !streamMsg.match(/#\s/));

// is_mature
const matureMsg = fmt.formatStreamMessage({ ...mockStream, is_mature: true }, null);
assert('is_mature: флаг отображается',           matureMsg.includes('🔞'));

// profile lines
const profile = { userLogin: 'testuser', description: 'Про стримы', discord: 'https://discord.gg/test', telegram: null, youtube: null, donate: null };
const msgWithProfile = fmt.formatStreamMessage(mockStream, profile);
assert('профиль: description отображается',      msgWithProfile.includes('Про стримы'));
assert('профиль: discord ссылка отображается',   msgWithProfile.includes('discord.gg'));

// getThumbnailUrl
const thumbUrl = fmt.getThumbnailUrl(mockStream);
assert('getThumbnailUrl заменяет {width}/{height}', thumbUrl === 'https://example.com/1280x720.jpg');

// formatStreamEndedMessage
const endedMsg = fmt.formatStreamEndedMessage(mockStream);
assert('formatStreamEndedMessage содержит 🔴',   endedMsg.includes('🔴'));
assert('formatStreamEndedMessage содержит имя',  endedMsg.includes('TestUser'));

// formatStatsMessage
const statsMsg = fmt.formatStatsMessage(5, [
  { user_login: 'a', user_name: 'Alpha', peakViewers: 300 },
  { user_login: 'b', user_name: 'Beta',  peakViewers: 100 },
], 2);
assert('formatStatsMessage: кол-во стримеров',   statsMsg.includes('5'));
assert('formatStatsMessage: активных стримов',   statsMsg.includes('2'));
assert('formatStatsMessage: топ — Alpha первый', statsMsg.indexOf('Alpha') < statsMsg.indexOf('Beta'));

// formatDigestMessage
const clips = [
  { id: 'c1', url: 'https://clips.twitch.tv/c1', broadcaster_name: 'Grubby', title: 'Epic play', view_count: 5000, created_at: '' },
  { id: 'c2', url: 'https://clips.twitch.tv/c2', broadcaster_name: 'Fan',    title: 'Nice catch', view_count: 1200, created_at: '' },
];
const digestMsg = fmt.formatDigestMessage(
  8,
  [
    { user_login: 'grubby', user_name: 'Grubby', peakViewers: 500 },
    { user_login: 'fan',    user_name: 'Fan',    peakViewers: 200 },
  ],
  '1 марта 2026 г.',
  350,
  clips,
);
assert('formatDigestMessage: дата "1 марта"',             digestMsg.includes('1 марта 2026'));
assert('formatDigestMessage: кол-во стримеров',           digestMsg.includes('8'));
assert('formatDigestMessage: средний пик зрителей',       digestMsg.includes('350'));
assert('formatDigestMessage: топ стримеров присутствует', digestMsg.includes('Grubby'));
assert('formatDigestMessage: блок клипов присутствует',   digestMsg.includes('🎬'));
assert('formatDigestMessage: клип Epic play',             digestMsg.includes('Epic play'));
assert('formatDigestMessage: ссылка на клип',             digestMsg.includes('clips.twitch.tv/c1'));
assert('formatDigestMessage: просмотры клипа',            digestMsg.includes('5'));
assert('formatDigestMessage: #HeroesOfTheStorm',          digestMsg.includes('#HeroesOfTheStorm'));

// formatDigestMessage без клипов
const digestNoClips = fmt.formatDigestMessage(3, [], '28 февраля 2026 г.', 0, []);
assert('formatDigestMessage: без клипов — нет блока 🎬',  !digestNoClips.includes('🎬'));

// ─── stats ────────────────────────────────────────────────────────────────────
console.log('\nstats.ts');
const stats = require('./dist/stats');

// Изначально пусто
let s = stats.getDailyStats();
assert('getDailyStats: изначально count=0',     s.count === 0);
assert('getDailyStats: изначально top пустой',  s.top.length === 0);
assert('getDailyStats: изначально avgPeak=0',   s.avgPeakViewers === 0);
assert('getDailyStats: date пустая строка',     s.date === '');

// Записываем стримы
stats.recordStream({ user_login: 'alpha', user_name: 'Alpha', viewer_count: 300 });
stats.recordStream({ user_login: 'beta',  user_name: 'Beta',  viewer_count: 100 });
stats.recordStream({ user_login: 'alpha', user_name: 'Alpha', viewer_count: 500 }); // обновляем пик

s = stats.getDailyStats();
assert('getDailyStats: count=2 уникальных',           s.count === 2);
assert('getDailyStats: peakViewers Alpha=500',         s.top[0].peakViewers === 500);
assert('getDailyStats: Beta в топе',                   s.top.some(x => x.user_name === 'Beta'));
assert('getDailyStats: сортировка — Alpha первый',     s.top[0].user_name === 'Alpha');
assert('getDailyStats: avgPeak = (500+100)/2 = 300',   s.avgPeakViewers === 300);
assert('getDailyStats: date задана (московская дата)', typeof s.date === 'string' && s.date.length > 0);

// shouldSendDigest: не срабатывает повторно в тот же UTC-час
const utcHour = new Date().getUTCHours();
const first  = stats.shouldSendDigest(utcHour);
const second = stats.shouldSendDigest(utcHour);
assert('shouldSendDigest: срабатывает первый раз',     first === true);
assert('shouldSendDigest: не срабатывает повторно',    second === false);
assert('shouldSendDigest: другой час — false',         stats.shouldSendDigest((utcHour + 1) % 24) === false);

// resetDailyStats
stats.resetDailyStats();
s = stats.getDailyStats();
assert('resetDailyStats: count обнулился',   s.count === 0);
assert('resetDailyStats: date обнулилась',   s.date === '');
assert('resetDailyStats: avgPeak обнулился', s.avgPeakViewers === 0);

// После сброса lastDigestDate НЕ сбрасывается — дублей быть не должно
assert('shouldSendDigest: после reset — не срабатывает повторно в тот же час', stats.shouldSendDigest(utcHour) === false);

// ─── greeter rate-limit ───────────────────────────────────────────────────────
console.log('\nai/greeter.ts (rate-limit без API-ключа)');

// GPTUNNEL_API_KEY не задан — generateWelcome должен вернуть null немедленно
process.env.GPTUNNEL_API_KEY = '';
process.env.GPTUNNEL_BASE_URL = 'https://api.gpttunnel.com/v1';
// Конфиг уже загружен, мокаем напрямую
const greeterModule = require('./dist/ai/greeter');
greeterModule.generateWelcome('Иван').then(result => {
  assert('generateWelcome без ключа возвращает null', result === null);

  // ─── Итог ─────────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(45)}`);
  console.log(`Итого: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
});
