/**
 * 展示页兼容脚本（直播姬 / 旧版 OBS CEF 不支持 ES Module 时使用）
 */
(function () {
  var DEFAULT_STYLE = {
    bg: false,
    fontFamily: 'PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif',
    fontSize: 22,
    color: '#ffffff',
    roomId: '2233',
  };

  var GUARD_ICONS = {
    100003: 'assets/guards/jianzhang.png',
    100002: 'assets/guards/tidu.png',
    100001: 'assets/guards/zongdu.png',
  };

  function normalizeStyle(style) {
    style = style || {};
    return {
      bg: Boolean(style.bg),
      fontFamily: style.fontFamily || DEFAULT_STYLE.fontFamily,
      fontSize: Math.max(12, Number(style.fontSize) || DEFAULT_STYLE.fontSize),
      color: style.color || DEFAULT_STYLE.color,
      roomId: String(style.roomId || style.r || DEFAULT_STYLE.roomId),
    };
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function fromBase64Url(b64) {
    var padded = b64.replace(/-/g, '+').replace(/_/g, '/');
    var padLen = padded.length % 4;
    if (padLen) padded += new Array(5 - padLen).join('=');
    var binary = atob(padded);
    if (typeof TextDecoder !== 'undefined') {
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    }
    try {
      return decodeURIComponent(escape(binary));
    } catch (e) {
      return binary;
    }
  }

  function getQueryParam(name, search) {
    search = search || location.search;
    if (typeof URLSearchParams !== 'undefined') {
      return new URLSearchParams(search).get(name);
    }
    var match = new RegExp('[?&]' + name + '=([^&]*)').exec(search);
    return match ? decodeURIComponent(match[1].replace(/\+/g, ' ')) : null;
  }

  function expandParsedConfig(data) {
    if (Array.isArray(data.i)) {
      var s = data.s || {};
      return {
        items: data.i.map(function (item) {
          return {
            giftId: Number(item.g) || 0,
            count: Math.max(1, Number(item.n) || 1),
            text: String(item.t || '').trim(),
            icon: item.icon || '',
          };
        }),
        style: normalizeStyle({
          bg: s.b != null ? s.b : s.bg,
          fontSize: s.z != null ? s.z : s.fontSize,
          color: s.c || s.color,
          fontFamily: s.f || s.fontFamily,
          roomId: s.r || s.roomId,
        }),
      };
    }
    return {
      items: Array.isArray(data.items) ? data.items : [],
      style: normalizeStyle(data.style),
    };
  }

  function parseConfigFromUrl(search) {
    search = search || location.search;
    var encoded = getQueryParam('c', search);
    if (!encoded) {
      return { items: [], style: normalizeStyle(), parseError: null };
    }
    try {
      var data = JSON.parse(fromBase64Url(encoded));
      var expanded = expandParsedConfig(data);
      return {
        items: expanded.items,
        style: expanded.style,
        parseError: null,
      };
    } catch (e) {
      return {
        items: [],
        style: normalizeStyle(),
        parseError: 'invalid',
      };
    }
  }

  function resolveIcon(icon) {
    if (!icon) return '';
    if (/^https?:\/\//i.test(icon)) return icon;
    try {
      return new URL(icon, location.href).href;
    } catch (e) {
      return icon;
    }
  }

  function applyMenuStyle(overlay, style) {
    var s = normalizeStyle(style);
    overlay.className = s.bg ? 'menu-overlay has-bg' : 'menu-overlay';
    overlay.style.fontFamily = s.fontFamily;
    overlay.style.setProperty('--menu-font-size', s.fontSize + 'px');
    overlay.style.setProperty('--menu-color', s.color);
  }

  function renderMenu(root, config) {
    var validItems = (config.items || []).filter(function (item) {
      return item.giftId && item.text;
    });

    applyMenuStyle(root, config.style);

    if (validItems.length === 0) {
      var message = config.parseError === 'invalid'
        ? '配置链接无效或已被截断，请在设置页重新复制完整链接'
        : '暂无菜单项，请通过设置页配置';
      root.innerHTML = '<div class="menu-empty">' + message + '</div>';
      return;
    }

    var list = document.createElement('ul');
    list.className = 'menu-list';

    validItems.forEach(function (item) {
      var li = document.createElement('li');
      li.className = 'menu-item';

      var iconEl = document.createElement('img');
      iconEl.className = 'gift-icon';
      iconEl.alt = '';
      iconEl.referrerPolicy = 'no-referrer';
      var iconSrc = resolveIcon(item.icon || GUARD_ICONS[item.giftId] || '');
      if (iconSrc) {
        iconEl.src = iconSrc;
        iconEl.onerror = function () { iconEl.style.visibility = 'hidden'; };
      } else {
        iconEl.style.visibility = 'hidden';
      }

      var body = document.createElement('div');
      body.className = 'item-body';

      var main = document.createElement('div');
      main.className = 'item-main';
      main.innerHTML = '<span class="count">x' + (item.count || 1) + '</span>' + escapeHtml(item.text);
      body.appendChild(main);

      li.appendChild(iconEl);
      li.appendChild(body);
      list.appendChild(li);
    });

    root.innerHTML = '';
    root.appendChild(list);
  }

  function applyGiftIcons(items, iconMap) {
    items.forEach(function (item) {
      if (item.icon) return;
      if (GUARD_ICONS[item.giftId]) {
        item.icon = GUARD_ICONS[item.giftId];
        return;
      }
      var gift = iconMap[item.giftId];
      if (gift) {
        item.icon = gift.gif || gift.img_basic || gift.img_dynamic || '';
      }
    });
  }

  function fetchGiftIconMap(roomId, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/gifts?room_id=' + encodeURIComponent(roomId || '2233'));
    xhr.onload = function () {
      var map = {};
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var data = JSON.parse(xhr.responseText);
          (data.data && data.data.list ? data.data.list : []).forEach(function (gift) {
            map[gift.id] = gift;
          });
        } catch (e) {
          // 忽略
        }
      }
      callback(map);
    };
    xhr.onerror = function () { callback({}); };
    xhr.send();
  }

  function needsRemoteIcons(items) {
    return items.some(function (item) {
      return !item.icon && !GUARD_ICONS[item.giftId];
    });
  }

  function boot() {
    var root = document.getElementById('menu-root');
    if (!root) return;

    var config;
    try {
      config = parseConfigFromUrl();
    } catch (e) {
      root.innerHTML = '<div class="menu-empty">页面脚本异常，请刷新浏览器源</div>';
      return;
    }

    if (config.parseError) {
      renderMenu(root, config);
      return;
    }

    applyGiftIcons(config.items, {});
    renderMenu(root, config);

    if (!needsRemoteIcons(config.items)) return;

    fetchGiftIconMap(config.style.roomId, function (map) {
      applyGiftIcons(config.items, map);
      renderMenu(root, config);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
