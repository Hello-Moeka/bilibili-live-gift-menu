const GIFT_API = 'https://api.live.bilibili.com/xlive/web-room/v1/giftPanel/giftConfig?platform=pc&source=live';

/** 固定置顶的大航海礼物（始终显示在礼物栏顶部） */
export const PINNED_GIFTS = [
  {
    id: 33972,
    name: '舰长',
    price: 198000,
    coin_type: 'gold',
    img_basic: 'https://s1.hdslb.com/bfs/live/a97726f370a5aa6d5e6100b042bee848efc560f6.png',
    pinned: true,
  },
  {
    id: 33908,
    name: '提督',
    price: 1998000,
    coin_type: 'gold',
    img_basic: 'https://s1.hdslb.com/bfs/live/af5b620387a20a8b65b9bd6fc47cf9058a8bbd85.png',
    pinned: true,
  },
  {
    id: 33909,
    name: '总督',
    price: 19998000,
    coin_type: 'gold',
    img_basic: 'https://s1.hdslb.com/bfs/live/52e00ca134a8a41f08b203eb5886875507e4b44e.png',
    pinned: true,
  },
];

const PINNED_IDS = new Set(PINNED_GIFTS.map((g) => g.id));

/** @type {Map<number, object>} */
let giftCache = null;

function mergePinnedGifts(list) {
  const rest = list.filter((g) => !PINNED_IDS.has(g.id));
  return [...PINNED_GIFTS, ...rest];
}

/**
 * 获取礼物列表（设置页每次打开时调用）
 * @param {string} [apiBase] 本地代理前缀，如 '/api'；为空则直连 B 站 API（可能受 CORS 限制）
 */
export async function fetchGiftList(apiBase = '') {
  const url = apiBase ? `${apiBase}/gifts` : GIFT_API;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`礼物列表请求失败 (${res.status})`);
  const data = await res.json();
  if (data.code !== 0) throw new Error(data.message || '礼物列表返回异常');
  const list = mergePinnedGifts(data.data?.list || []);
  giftCache = new Map(list.map((g) => [g.id, g]));
  return list;
}

/** @param {number} id */
export function getGiftById(id) {
  return giftCache?.get(Number(id)) ?? PINNED_GIFTS.find((g) => g.id === Number(id)) ?? null;
}

function matchesKeyword(gift, kw) {
  return String(gift.name).toLowerCase().includes(kw)
    || String(gift.id).includes(kw);
}

/** 按名称搜索礼物，置顶项始终优先显示 */
export function searchGifts(list, keyword) {
  const kw = keyword.trim().toLowerCase();
  const pinned = kw
    ? PINNED_GIFTS.filter((g) => matchesKeyword(g, kw))
    : PINNED_GIFTS;
  const others = (kw ? list.filter((g) => matchesKeyword(g, kw)) : list)
    .filter((g) => !PINNED_IDS.has(g.id));
  return [...pinned, ...others].slice(0, 50);
}

/** @param {object} gift */
export function getGiftIcon(gift) {
  return gift?.img_basic || gift?.img_dynamic || gift?.gif || '';
}

/** B 站金瓜子 1000 = 1 元 */
export function formatGiftPrice(gift) {
  if (!gift) return '';
  if (gift.coin_type === 'silver') {
    return `${gift.price}银瓜子`;
  }
  const yuan = gift.price / 1000;
  const text = Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(1).replace(/\.0$/, '');
  return `${text}元`;
}
