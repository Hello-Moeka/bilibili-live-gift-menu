const GIFT_API = 'https://api.live.bilibili.com/xlive/web-room/v1/giftPanel/giftConfig?platform=pc&source=live';

/** 大航海固定项（非标准礼物，使用本地图标） */
export const GUARD_ITEMS = [
  {
    id: 100003,
    name: '舰长',
    priceLabel: '198元/月',
    img_basic: 'assets/guards/jianzhang.png',
    isGuard: true,
  },
  {
    id: 100002,
    name: '提督',
    priceLabel: '1998元/月',
    img_basic: 'assets/guards/tidu.png',
    isGuard: true,
  },
  {
    id: 100001,
    name: '总督',
    priceLabel: '19998元/月',
    img_basic: 'assets/guards/zongdu.png',
    isGuard: true,
  },
];

const GUARD_IDS = new Set(GUARD_ITEMS.map((g) => g.id));

/** @type {Map<number, object>} */
let giftCache = null;

/**
 * 获取礼物列表（设置页每次打开时调用）
 * @param {string} [apiBase] 本地代理前缀，如 '/api'；为空则直连 B 站 API（可能受 CORS 限制）
 * @param {string} [roomId] 直播间号，用于拉取房间礼物面板的动态图标（经本地代理合并）
 */
export async function fetchGiftList(apiBase = '', roomId = '2233') {
  const roomQuery = roomId ? `?room_id=${encodeURIComponent(roomId)}` : '';
  const url = apiBase ? `${apiBase}/gifts${roomQuery}` : GIFT_API;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`礼物列表请求失败 (${res.status})`);
  const data = await res.json();
  if (data.code !== 0) throw new Error(data.message || '礼物列表返回异常');
  const list = data.data?.list || [];
  giftCache = new Map(list.map((g) => [g.id, g]));
  GUARD_ITEMS.forEach((g) => giftCache.set(g.id, g));
  return list;
}

/** @param {number} id */
export function getGiftById(id) {
  const numId = Number(id);
  return GUARD_ITEMS.find((g) => g.id === numId)
    ?? giftCache?.get(numId)
    ?? null;
}

function matchesKeyword(item, kw) {
  return String(item.name).toLowerCase().includes(kw)
    || String(item.id).includes(kw);
}

/** 搜索礼物，大航海项始终优先 */
export function searchGifts(list, keyword) {
  const kw = keyword.trim().toLowerCase();
  const guards = kw
    ? GUARD_ITEMS.filter((g) => matchesKeyword(g, kw))
    : GUARD_ITEMS;
  const others = (kw ? list.filter((g) => matchesKeyword(g, kw)) : list)
    .filter((g) => !GUARD_IDS.has(g.id));
  return [...guards, ...others].slice(0, 50);
}

/** @param {object} gift */
export function getGiftIcon(gift) {
  // gif 为礼物面板动图；img_basic 为静态缩略图（s1 域名，本地预览更稳）
  return gift?.gif || gift?.img_basic || gift?.img_dynamic || '';
}

/** 静态缩略图，用于动图加载失败时回退 */
export function getGiftIconStatic(gift) {
  return gift?.img_basic || gift?.img_dynamic || '';
}

/**
 * 绑定礼物图标到 <img>，处理 B 站 CDN 防盗链（i0 域名拒绝 localhost Referer）
 * @param {HTMLImageElement} img
 * @param {object} gift
 */
export function bindGiftImage(img, gift) {
  if (!gift) {
    img.removeAttribute('src');
    return;
  }
  img.referrerPolicy = 'no-referrer';
  img.alt = '';
  const animated = gift.gif || '';
  const staticIcon = getGiftIconStatic(gift);
  const primary = animated || staticIcon;
  img.onerror = null;
  if (!primary) {
    img.removeAttribute('src');
    return;
  }
  img.src = primary;
  if (animated && staticIcon && staticIcon !== animated) {
    img.onerror = () => {
      img.onerror = null;
      img.src = staticIcon;
    };
  }
}

/** 将图标路径转为完整 URL，便于写入 OBS 配置 */
export function resolveGiftIconUrl(icon) {
  if (!icon) return '';
  if (/^https?:\/\//i.test(icon)) return icon;
  return new URL(icon, location.href).href;
}

/** B 站金瓜子 1000 = 1 元 */
export function formatGiftPrice(gift) {
  if (!gift) return '';
  if (gift.priceLabel) return gift.priceLabel;
  if (gift.coin_type === 'silver') {
    return `${gift.price}银瓜子`;
  }
  const yuan = gift.price / 1000;
  const text = Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(1).replace(/\.0$/, '');
  return `${text}元`;
}
