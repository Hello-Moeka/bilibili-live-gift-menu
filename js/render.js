/** @typedef {{ bg?: boolean, fontFamily?: string, fontSize?: number, color?: string, layout?: string, roomId?: string }} MenuStyle */

export const DEFAULT_STYLE = {
  bg: false,
  fontFamily: 'PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif',
  fontSize: 22,
  color: '#ffffff',
  layout: 'vertical',
};

export const FONT_PRESETS = [
  { label: '苹方 / 冬青黑体', value: 'PingFang SC, Hiragino Sans GB, sans-serif' },
  { label: '微软雅黑', value: 'Microsoft YaHei, PingFang SC, sans-serif' },
  { label: '思源黑体', value: 'Source Han Sans SC, Noto Sans SC, sans-serif' },
  { label: 'Noto Sans SC', value: '"Noto Sans SC", "Source Han Sans SC", sans-serif' },
  { label: '等线', value: 'DengXian, "Microsoft YaHei", sans-serif' },
  { label: '黑体', value: 'SimHei, Microsoft YaHei, sans-serif' },
  { label: '宋体', value: 'SimSun, STSong, serif' },
  { label: '仿宋', value: 'FangSong, STFangsong, serif' },
  { label: '楷体', value: 'KaiTi, STKaiti, serif' },
  { label: '隶书', value: 'LiSu, STLiti, serif' },
  { label: '幼圆', value: 'YouYuan, "Yuanti SC", sans-serif' },
  { label: '华文细黑', value: 'STXihei, "Microsoft YaHei", sans-serif' },
  { label: '微软正黑体', value: '"Microsoft JhengHei", "PingFang TC", sans-serif' },
  { label: 'Segoe UI', value: '"Segoe UI", "Microsoft YaHei", sans-serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Georgia', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Impact', value: 'Impact, Haettenschweiler, sans-serif' },
];

/** @param {Partial<MenuStyle & { roomId?: string }>} style */
export function normalizeStyle(style = {}) {
  return {
    bg: Boolean(style.bg),
    fontFamily: style.fontFamily || DEFAULT_STYLE.fontFamily,
    fontSize: Math.max(12, Math.min(72, Number(style.fontSize) || DEFAULT_STYLE.fontSize)),
    color: /^#[0-9a-f]{6}$/i.test(style.color || '') ? style.color : DEFAULT_STYLE.color,
    layout: style.layout === 'horizontal' ? 'horizontal' : 'vertical',
    roomId: String(style.roomId || style.r || '2233'),
  };
}

/** @param {HTMLElement} overlay @param {MenuStyle} style */
export function applyMenuStyle(overlay, style) {
  const s = normalizeStyle(style);
  overlay.classList.toggle('has-bg', s.bg);
  overlay.classList.toggle('is-horizontal', s.layout === 'horizontal');
  overlay.style.fontFamily = s.fontFamily;
  overlay.style.setProperty('--menu-font-size', `${s.fontSize}px`);
  overlay.style.setProperty('--menu-color', s.color);
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** @param {HTMLElement} root @param {{ items: object[], style?: MenuStyle, parseError?: string | null }} config */
export function renderMenu(root, config) {
  const style = normalizeStyle(config.style);
  const validItems = (config.items || []).filter((item) => item.giftId && item.text);

  root.className = 'menu-overlay';
  applyMenuStyle(root, style);

  if (validItems.length === 0) {
    const message = config.parseError === 'invalid'
      ? '配置链接无效或已被截断，请在设置页重新复制完整链接'
      : '暂无菜单项，请通过设置页配置';
    root.innerHTML = `<div class="menu-empty">${message}</div>`;
    return;
  }

  const list = document.createElement('ul');
  list.className = 'menu-list';

  function appendItem(item) {
    const li = document.createElement('li');
    li.className = 'menu-item';

    const icon = document.createElement('img');
    icon.className = 'gift-icon';
    icon.alt = '';
    icon.referrerPolicy = 'no-referrer';
    icon.src = item.icon || '';
    icon.onerror = () => { icon.style.visibility = 'hidden'; };

    const body = document.createElement('div');
    body.className = 'item-body';

    const main = document.createElement('div');
    main.className = 'item-main';
    main.innerHTML = `<span class="count">x${item.count || 1}</span>${escapeHtml(item.text)}`;
    body.appendChild(main);

    li.append(icon, body);
    list.appendChild(li);
  }

  validItems.forEach(appendItem);
  if (style.layout === 'horizontal') {
    list.classList.add('menu-list-horizontal');
    list.style.setProperty('--menu-scroll-duration', `${Math.max(12, validItems.length * 4)}s`);
  }

  root.innerHTML = '';
  root.appendChild(list);
}
