/** @typedef {{ bg?: boolean, fontFamily?: string, fontSize?: number, subtitleSize?: number, color?: string, subtitleColor?: string }} MenuStyle */

export const DEFAULT_STYLE = {
  bg: false,
  fontFamily: 'PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif',
  fontSize: 22,
  subtitleSize: 14,
  color: '#ffffff',
  subtitleColor: 'rgba(255, 255, 255, 0.72)',
};

export const FONT_PRESETS = [
  { label: '苹方 / 冬青黑体', value: 'PingFang SC, Hiragino Sans GB, sans-serif' },
  { label: '微软雅黑', value: 'Microsoft YaHei, PingFang SC, sans-serif' },
  { label: '黑体', value: 'SimHei, Microsoft YaHei, sans-serif' },
  { label: '宋体', value: 'SimSun, STSong, serif' },
  { label: '楷体', value: 'KaiTi, STKaiti, serif' },
  { label: '思源黑体', value: 'Source Han Sans SC, Noto Sans SC, sans-serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
];

/** @param {Partial<MenuStyle>} style */
export function normalizeStyle(style = {}) {
  return {
    bg: Boolean(style.bg),
    fontFamily: style.fontFamily || DEFAULT_STYLE.fontFamily,
    fontSize: Math.max(12, Number(style.fontSize) || DEFAULT_STYLE.fontSize),
    subtitleSize: Math.max(10, Number(style.subtitleSize) || DEFAULT_STYLE.subtitleSize),
    color: style.color || DEFAULT_STYLE.color,
    subtitleColor: style.subtitleColor || DEFAULT_STYLE.subtitleColor,
  };
}

/** @param {HTMLElement} overlay @param {MenuStyle} style */
export function applyMenuStyle(overlay, style) {
  const s = normalizeStyle(style);
  overlay.classList.toggle('has-bg', s.bg);
  overlay.style.fontFamily = s.fontFamily;
  overlay.style.setProperty('--menu-font-size', `${s.fontSize}px`);
  overlay.style.setProperty('--menu-subtitle-size', `${s.subtitleSize}px`);
  overlay.style.setProperty('--menu-color', s.color);
  overlay.style.setProperty('--menu-subtitle-color', s.subtitleColor);
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** @param {HTMLElement} root @param {{ title?: string, items: object[], style?: MenuStyle }} config */
export function renderMenu(root, config) {
  const style = normalizeStyle(config.style);
  const validItems = (config.items || []).filter((item) => item.giftId && item.text);

  root.className = 'menu-overlay';
  applyMenuStyle(root, style);

  if (validItems.length === 0) {
    root.innerHTML = '<div class="menu-empty">暂无菜单项，请通过设置页配置</div>';
    return;
  }

  const list = document.createElement('ul');
  list.className = 'menu-list';

  validItems.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'menu-item';

    const icon = document.createElement('img');
    icon.className = 'gift-icon';
    icon.alt = '';
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
  });

  root.replaceChildren(list);
}
