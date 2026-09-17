/**
 * 礼物菜单配置 — URL 参数编解码
 * 参数: ?c=<base64url JSON>
 *
 * 展示页短格式（直播姬 URL 长度限制）:
 * { i: [{ g, n, t }], s: { b, z, c, f?, r?, l? } }
 *
 * 设置页草稿完整格式:
 * { items: [{ giftId, count, text, icon?, giftName? }], style?: {...} }
 */

import { normalizeStyle, DEFAULT_STYLE } from './render.js';

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(b64) {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function expandParsedConfig(data) {
  if (Array.isArray(data.i)) {
    const s = data.s || {};
    return {
      items: data.i.map((item) => ({
        giftId: Number(item.g) || 0,
        count: Math.max(1, Number(item.n) || 1),
        text: String(item.t || '').trim(),
        icon: item.icon || '',
      })),
      style: normalizeStyle({
        bg: s.b ?? s.bg,
        fontSize: s.z ?? s.fontSize,
        color: s.c ?? s.color,
        fontFamily: s.f ?? s.fontFamily,
        roomId: s.r ?? s.roomId,
        layout: s.l === 'h' || s.layout === 'horizontal' ? 'horizontal' : 'vertical',
      }),
    };
  }
  return {
    items: Array.isArray(data.items) ? data.items : [],
    style: normalizeStyle(data.style),
  };
}

/** @returns {{ items: object[], style: object, parseError?: string | null }} */
export function parseConfigFromUrl(search = location.search) {
  const params = new URLSearchParams(search);
  const encoded = params.get('c');
  if (!encoded) {
    return { items: [], style: normalizeStyle(), parseError: null };
  }
  try {
    const json = fromBase64Url(encoded);
    const data = JSON.parse(json);
    const expanded = expandParsedConfig(data);
    return {
      items: expanded.items,
      style: expanded.style,
      parseError: null,
    };
  } catch {
    return {
      items: [],
      style: normalizeStyle(),
      parseError: 'invalid',
    };
  }
}

/** @param {{ items: object[], style?: object }} config @param {string} [roomId] */
export function encodeConfigToParam(config, roomId = '2233') {
  const style = normalizeStyle(config.style);
  const items = (config.items || [])
    .map((item) => ({
      giftId: Number(item.giftId) || 0,
      count: Math.max(1, Number(item.count) || 1),
      text: String(item.text || '').trim(),
    }))
    .filter((item) => item.giftId && item.text);

  const shortStyle = {
    b: style.bg ? 1 : 0,
    z: style.fontSize,
    c: style.color,
  };
  if (style.fontFamily && style.fontFamily !== DEFAULT_STYLE.fontFamily) {
    shortStyle.f = style.fontFamily;
  }
  if (style.layout === 'horizontal') {
    shortStyle.l = 'h';
  }
  if (roomId && roomId !== '2233') {
    shortStyle.r = roomId;
  }

  const payload = {
    i: items.map((item) => ({ g: item.giftId, n: item.count, t: item.text })),
    s: shortStyle,
  };
  return toBase64Url(JSON.stringify(payload));
}

/** @param {{ items: object[], style?: object }} config @param {{ validOnly?: boolean, forDisplay?: boolean }} [options] */
export function encodeDraftToParam(config, { validOnly = false, forDisplay = false } = {}) {
  if (forDisplay) {
    throw new Error('forDisplay 请使用 encodeConfigToParam');
  }
  const style = normalizeStyle(config.style);
  let items = (config.items || []).map((item) => ({
    giftId: Number(item.giftId) || 0,
    count: Math.max(1, Number(item.count) || 1),
    text: String(item.text || '').trim(),
    icon: item.icon || '',
    giftName: item.giftName || '',
  }));

  if (validOnly) {
    items = items.filter((item) => item.giftId && item.text);
  } else {
    items = items.filter((item) => item.giftId || item.text || item.icon);
  }

  const payload = {
    items,
    style: {
      bg: style.bg,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      color: style.color,
      layout: style.layout,
      roomId: style.roomId,
    },
  };
  return toBase64Url(JSON.stringify(payload));
}

const DRAFT_STORAGE_KEY = 'bilibili-live-gift-menu:draft';

/** @param {{ items: object[], style?: object }} config */
export function saveDraft(config) {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
      items: config.items || [],
      style: normalizeStyle(config.style),
    }));
  } catch {
    // 隐私模式或存储已满时忽略
  }
}

/** @returns {{ items: object[], style: object } | null} */
export function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return {
      items: Array.isArray(data.items) ? data.items : [],
      style: normalizeStyle(data.style),
    };
  } catch {
    return null;
  }
}

/** 设置页加载：URL 参数优先，否则读取本地草稿 */
export function loadSettingsConfig() {
  const params = new URLSearchParams(location.search);
  if (params.get('c')) {
    return parseConfigFromUrl();
  }
  return loadDraft() || { items: [], style: normalizeStyle() };
}

/** @returns {string | null} */
export function getConfigToken(search = location.search) {
  const params = new URLSearchParams(search);
  const token = params.get('t');
  return token && /^[A-Za-z0-9_-]{20,32}$/.test(token) ? token : null;
}

/** @param {string} token */
export async function fetchConfigByToken(token) {
  const res = await fetch(`/api/configs/${encodeURIComponent(token)}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`配置读取失败 (${res.status})`);
  const data = await res.json();
  if (data.code !== 0 || !data.config) throw new Error(data.message || '配置读取异常');
  return {
    items: Array.isArray(data.config.items) ? data.config.items : [],
    style: normalizeStyle(data.config.style),
  };
}

/** 读取当前浏览器最近一次保存的配置；配置本体仍由后端返回。 */
export async function fetchLastConfig() {
  const res = await fetch('/api/last-config', {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`最近配置读取失败 (${res.status})`);
  const data = await res.json();
  if (data.code !== 0 || !data.config || !data.token) {
    throw new Error(data.message || '最近配置读取异常');
  }
  return {
    token: data.token,
    config: {
      items: Array.isArray(data.config.items) ? data.config.items : [],
      style: normalizeStyle(data.config.style),
    },
  };
}

/** @param {object} config */
export async function saveConfigToServer(config) {
  const res = await fetch('/api/configs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(config),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.code !== 0 || !data.token) {
    throw new Error(data.message || `配置保存失败 (${res.status})`);
  }
  return data;
}

/** @param {string} token */
export function buildTokenUrl(token, basePath = 'index.html') {
  const url = new URL(basePath, location.href);
  url.search = `t=${encodeURIComponent(token)}`;
  return url.href;
}

/** @param {string} token */
export function syncTokenUrl(token) {
  const url = new URL(location.href);
  url.search = `t=${encodeURIComponent(token)}`;
  history.replaceState(null, '', url);
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // 忽略
  }
}

/** 将当前草稿同步到设置页地址栏，刷新后仍可恢复 */
export function syncSettingsUrl(config) {
  const param = encodeDraftToParam(config);
  const url = new URL(location.pathname, location.href);
  url.search = `c=${param}`;
  history.replaceState(null, '', url);
}

/** @param {{ items: object[] }} config @param {string} [basePath] @param {string} [roomId] */
export function buildDisplayUrl(config, basePath = 'index.html', roomId = '2233') {
  const param = encodeConfigToParam(config, roomId);
  const url = new URL(basePath, location.href);
  url.search = `c=${param}`;
  return url.href;
}
