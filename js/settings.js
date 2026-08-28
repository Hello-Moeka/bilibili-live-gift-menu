import { loadSettingsConfig, buildDisplayUrl, saveDraft, syncSettingsUrl } from './config.js';
import { fetchGiftList, searchGifts, getGiftIcon, formatGiftPrice, GUARD_ITEMS, getGiftById, resolveGiftIconUrl, bindGiftImage } from './gifts.js';
import { renderMenu, FONT_PRESETS, normalizeStyle } from './render.js';

/** @type {object[]} */
let giftList = [];

/** @type {{ items: object[], style: object }} */
let config = { items: [], style: normalizeStyle() };

const statusBar = document.getElementById('status-bar');
const itemsContainer = document.getElementById('menu-items');
const urlInput = document.getElementById('url-output');
const previewRoot = document.getElementById('preview-root');

const bgInput = document.getElementById('bg-input');
const fontFamilyInput = document.getElementById('font-family-input');
const fontSizeInput = document.getElementById('font-size-input');
const colorInput = document.getElementById('color-input');
const roomIdInput = document.getElementById('room-id-input');

const ROOM_ID_STORAGE_KEY = 'bilibili-live-gift-menu:roomId';

function setStatus(type, message) {
  statusBar.className = `status-bar ${type}`;
  statusBar.textContent = message;
}

function getRoomId() {
  const value = roomIdInput.value.trim();
  return value || '2233';
}

function saveRoomId() {
  try {
    localStorage.setItem(ROOM_ID_STORAGE_KEY, getRoomId());
  } catch {
    // 隐私模式或存储已满时忽略
  }
}

function loadRoomId() {
  try {
    const saved = localStorage.getItem(ROOM_ID_STORAGE_KEY);
    if (saved) roomIdInput.value = saved;
  } catch {
    // 忽略
  }
}

async function loadGiftList() {
  setStatus('loading', '正在从 B 站拉取礼物列表…');
  try {
    giftList = await fetchGiftList('/api', getRoomId());
    const roomId = getRoomId();
    setStatus('success', `已加载 ${giftList.length} 个礼物（房间 ${roomId} 动态图标）`);
    return true;
  } catch (err) {
    setStatus('error', `礼物列表加载失败：${err.message}。请确认已通过 python server.py 启动本地服务。`);
    return false;
  }
}

function createEmptyItem() {
  return { giftId: 0, count: 1, text: '', icon: '', giftName: '' };
}

function getStyleFromForm() {
  return normalizeStyle({
    bg: bgInput.checked,
    fontFamily: fontFamilyInput.value,
    fontSize: fontSizeInput.value,
    color: colorInput.value,
  });
}

function getConfigFromForm() {
  return {
    style: getStyleFromForm(),
    items: [...itemsContainer.querySelectorAll('.menu-item-row')].map((row) => ({
      giftId: Number(row.dataset.giftId) || 0,
      count: Math.max(1, Number(row.querySelector('.count-input')?.value) || 1),
      text: row.querySelector('.text-input')?.value.trim() || '',
      icon: row.dataset.giftIcon || '',
      giftName: row.querySelector('.gift-select-input')?.value.trim() || '',
    })),
  };
}

function updateUrl() {
  config = getConfigFromForm();
  const url = buildDisplayUrl(config, 'index.html');
  urlInput.value = url;
  saveDraft(config);
  syncSettingsUrl(config);
  renderPreview(config);
}

function renderPreview(cfg) {
  previewRoot.innerHTML = '';
  const overlay = document.createElement('div');
  renderMenu(overlay, cfg);
  previewRoot.appendChild(overlay);
}

function appendGiftOption(dropdown, row, gift) {
  const opt = document.createElement('div');
  opt.className = 'gift-option';
  opt.dataset.giftId = gift.id;
  const img = document.createElement('img');
  bindGiftImage(img, gift);
  const name = document.createElement('span');
  name.textContent = gift.name;
  const meta = document.createElement('span');
  meta.className = 'gift-meta';
  meta.textContent = `#${gift.id} · ${formatGiftPrice(gift)}`;
  opt.append(img, name, meta);
  opt.addEventListener('mousedown', (e) => {
    e.preventDefault();
    selectGift(row, gift);
  });
  dropdown.appendChild(opt);
}

function buildGiftDropdown(row, input) {
  const dropdown = row.querySelector('.gift-dropdown');
  const keyword = input.value.trim();
  const results = searchGifts(giftList, keyword);

  dropdown.innerHTML = '';
  if (results.length === 0) {
    dropdown.innerHTML = '<div class="gift-option" style="cursor:default;color:var(--text-muted)">无匹配礼物</div>';
  } else {
    const guardResults = results.filter((g) => GUARD_ITEMS.some((p) => p.id === g.id));
    const otherResults = results.filter((g) => !GUARD_ITEMS.some((p) => p.id === g.id));

    if (guardResults.length > 0) {
      const label = document.createElement('div');
      label.className = 'gift-dropdown-label';
      label.textContent = '大航海';
      dropdown.appendChild(label);
      guardResults.forEach((gift) => appendGiftOption(dropdown, row, gift));
    }

    if (otherResults.length > 0) {
      if (guardResults.length > 0) {
        const label = document.createElement('div');
        label.className = 'gift-dropdown-label';
        label.textContent = '全部礼物';
        dropdown.appendChild(label);
      }
      otherResults.forEach((gift) => appendGiftOption(dropdown, row, gift));
    }
  }
  dropdown.classList.add('open');
}

function selectGift(row, gift) {
  row.dataset.giftId = gift.id;
  row.dataset.giftIcon = resolveGiftIconUrl(getGiftIcon(gift));
  const preview = row.querySelector('.gift-preview');
  bindGiftImage(preview, gift);
  preview.style.visibility = 'visible';
  const input = row.querySelector('.gift-select-input');
  input.value = gift.name;
  row.querySelector('.gift-dropdown').classList.remove('open');
  updateUrl();
}

function createItemRow(item = createEmptyItem()) {
  const row = document.createElement('div');
  row.className = 'menu-item-row';
  row.dataset.giftId = item.giftId || '';
  row.dataset.giftIcon = item.icon || '';

  const preview = document.createElement('img');
  preview.className = 'gift-preview';
  preview.alt = '';
  if (item.giftId) {
    const g = giftList.find((x) => x.id === item.giftId) || getGiftById(item.giftId);
    if (g) bindGiftImage(preview, g);
    else if (item.icon) {
      preview.src = item.icon;
      preview.referrerPolicy = 'no-referrer';
    }
  } else if (item.icon) {
    preview.src = item.icon;
    preview.referrerPolicy = 'no-referrer';
  }
  if (!preview.src) preview.style.visibility = 'hidden';

  const selectWrap = document.createElement('div');
  selectWrap.className = 'gift-select-wrap';
  const giftInput = document.createElement('input');
  giftInput.type = 'text';
  giftInput.className = 'gift-select-input';
  giftInput.placeholder = '搜索礼物名称或 ID…';
  giftInput.value = item.giftName || '';
  if (item.giftId && !item.giftName) {
    const g = giftList.find((x) => x.id === item.giftId) || getGiftById(item.giftId);
    if (g) giftInput.value = g.name;
  }
  const dropdown = document.createElement('div');
  dropdown.className = 'gift-dropdown';
  selectWrap.append(giftInput, dropdown);

  const countInput = document.createElement('input');
  countInput.type = 'number';
  countInput.className = 'count-input';
  countInput.min = '1';
  countInput.value = item.count || 1;

  const textInput = document.createElement('input');
  textInput.type = 'text';
  textInput.className = 'text-input';
  textInput.placeholder = '菜单内容，如：上车一小时';
  textInput.value = item.text || '';

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'btn btn-danger';
  delBtn.title = '删除';
  delBtn.textContent = '×';

  giftInput.addEventListener('focus', () => buildGiftDropdown(row, giftInput));
  giftInput.addEventListener('input', () => buildGiftDropdown(row, giftInput));
  giftInput.addEventListener('blur', () => {
    setTimeout(() => dropdown.classList.remove('open'), 150);
  });

  countInput.addEventListener('input', updateUrl);
  textInput.addEventListener('input', updateUrl);
  delBtn.addEventListener('click', () => {
    row.remove();
    updateUrl();
  });

  row.append(preview, selectWrap, countInput, textInput, delBtn);
  return row;
}

function renderItems() {
  itemsContainer.innerHTML = '';
  const items = config.items.length > 0 ? config.items : [createEmptyItem()];
  items.forEach((item) => itemsContainer.appendChild(createItemRow(item)));
}

function populateFontSelect() {
  fontFamilyInput.innerHTML = '';
  FONT_PRESETS.forEach((preset) => {
    const opt = document.createElement('option');
    opt.value = preset.value;
    opt.textContent = preset.label;
    fontFamilyInput.appendChild(opt);
  });
}

function ensureFontOption(fontFamily) {
  if (!fontFamily || FONT_PRESETS.some((p) => p.value === fontFamily)) return;
  const opt = document.createElement('option');
  opt.value = fontFamily;
  opt.textContent = '已保存的字体';
  fontFamilyInput.appendChild(opt);
}

function applyStyleToForm(style) {
  const s = normalizeStyle(style);
  bgInput.checked = s.bg;
  ensureFontOption(s.fontFamily);
  fontFamilyInput.value = FONT_PRESETS.some((p) => p.value === s.fontFamily)
    ? s.fontFamily
    : (s.fontFamily || FONT_PRESETS[0].value);
  fontSizeInput.value = s.fontSize;
  colorInput.value = toHexColor(s.color, '#ffffff');
}

function toHexColor(value, fallback) {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  const m = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) {
    const hex = [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
    return `#${hex}`;
  }
  return fallback;
}

document.getElementById('add-item-btn').addEventListener('click', () => {
  itemsContainer.appendChild(createItemRow());
});

document.getElementById('copy-url-btn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(urlInput.value);
    setStatus('success', '链接已复制到剪贴板');
    setTimeout(() => setStatus('success', `已加载 ${giftList.length} 个礼物`), 3000);
  } catch {
    urlInput.select();
    setStatus('success', '请手动复制选中的链接');
  }
});

[bgInput, fontFamilyInput, fontSizeInput, colorInput]
  .forEach((el) => el.addEventListener('input', updateUrl));
bgInput.addEventListener('change', updateUrl);

roomIdInput.addEventListener('change', async () => {
  saveRoomId();
  const ok = await loadGiftList();
  if (ok) renderItems();
});

async function init() {
  populateFontSelect();
  loadRoomId();
  const ok = await loadGiftList();
  if (!ok) return;

  config = loadSettingsConfig();
  applyStyleToForm(config.style);
  renderItems();
  updateUrl();
}

init();
