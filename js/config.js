/**
 * 礼物菜单配置 — URL 参数编解码
 * 参数: ?c=<base64url JSON>
 *
 * JSON 结构:
 * {
 *   title?: string,
 *   items: Array<{ giftId, count, text, icon? }>,
 *   style?: { bg, fontFamily, fontSize, subtitleSize, color, subtitleColor }
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

/** @returns {{ title: string, items: object[] }} */
export function parseConfigFromUrl(search = location.search) {
  const params = new URLSearchParams(search);
  const encoded = params.get('c');
  if (!encoded) {
    return { title: '', items: [], style: normalizeStyle() };
  }
  try {
    const json = fromBase64Url(encoded);
    const data = JSON.parse(json);
    return {
      title: typeof data.title === 'string' ? data.title : '',
      items: Array.isArray(data.items) ? data.items : [],
      style: normalizeStyle(data.style),
    };
  } catch {
    return { title: '', items: [], style: normalizeStyle() };
  }
}

/** @param {{ title?: string, items: object[], style?: object }} config */
export function encodeConfigToParam(config) {
  const style = normalizeStyle(config.style);
  const payload = {
    items: (config.items || []).map((item) => ({
      giftId: Number(item.giftId) || 0,
      count: Math.max(1, Number(item.count) || 1),
      text: String(item.text || '').trim(),
      icon: item.icon || '',
    })).filter((item) => item.giftId && item.text),
    style: {
      bg: style.bg,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      subtitleSize: style.subtitleSize,
      color: style.color,
      subtitleColor: style.subtitleColor,
    },
  };
  return toBase64Url(JSON.stringify(payload));
}

/** @param {{ title?: string, items: object[] }} config @param {string} [basePath] */
export function buildDisplayUrl(config, basePath = 'index.html') {
  const param = encodeConfigToParam(config);
  const url = new URL(basePath, location.href);
  url.search = `c=${param}`;
  return url.href;
}
