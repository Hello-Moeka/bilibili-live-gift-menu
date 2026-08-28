const GIFT_API = 'https://api.live.bilibili.com/xlive/web-room/v1/giftPanel/giftConfig?platform=pc&source=live';

/** @type {Map<number, object>} */
let giftCache = null;

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
  const list = data.data?.list || [];
  giftCache = new Map(list.map((g) => [g.id, g]));
  return list;
}

/** @param {number} id */
export function getGiftById(id) {
  return giftCache?.get(Number(id)) ?? null;
}

/** 按名称搜索礼物 */
export function searchGifts(list, keyword) {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return list;
  return list.filter((g) =>
    String(g.name).toLowerCase().includes(kw)
    || String(g.id).includes(kw),
  );
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
