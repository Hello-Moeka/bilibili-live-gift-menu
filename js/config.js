/**
 * 礼物菜单配置 — URL 参数编解码
 * 参数: ?c=<base64url JSON>
 *
 * JSON 结构:
 * {
 *   items: Array<{ giftId, count, text, icon?, giftName? }>,
 *   style?: { bg, fontFamily, fontSize, color }
 * }
 */

import { normalizeStyle } from './render.js';

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
    return {
      items: Array.isArray(data.items) ? data.items : [],
      style: normalizeStyle(data.style),
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

/** @param {{ items: object[], style?: object }} config */
export function encodeConfigToParam(config) {
  return encodeDraftToParam(config, { validOnly: true, forDisplay: true });
}

/** @param {{ items: object[], style?: object }} config @param {{ validOnly?: boolean, forDisplay?: boolean }} [options] */
export function encodeDraftToParam(config, { validOnly = false, forDisplay = false } = {}) {
  const style = normalizeStyle(config.style);
  let items = (config.items || []).map((item) => {
    const mapped = {
      giftId: Number(item.giftId) || 0,
      count: Math.max(1, Number(item.count) || 1),
      text: String(item.text || '').trim(),
      icon: item.icon || '',
    };
    if (!forDisplay) {
      mapped.giftName = item.giftName || '';
    }
    return mapped;
  });

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

/** 将当前草稿同步到设置页地址栏，刷新后仍可恢复 */
export function syncSettingsUrl(config) {
  const param = encodeDraftToParam(config);
  const url = new URL(location.pathname, location.href);
  url.search = `c=${param}`;
  history.replaceState(null, '', url);
}

/** @param {{ items: object[] }} config @param {string} [basePath] */
export function buildDisplayUrl(config, basePath = 'index.html') {
  const param = encodeConfigToParam(config);
  const url = new URL(basePath, location.href);
  url.search = `c=${param}`;
  return url.href;
}
