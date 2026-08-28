/**
 * 展示页兼容脚本（直播姬 / 旧版 OBS CEF 不支持 ES Module 时使用）
 */
(function () {
  var DEFAULT_STYLE = {
    bg: false,
    fontFamily: 'PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif',
    fontSize: 22,
    color: '#ffffff',
  };

  function normalizeStyle(style) {
    style = style || {};
    return {
      bg: Boolean(style.bg),
      fontFamily: style.fontFamily || DEFAULT_STYLE.fontFamily,
      fontSize: Math.max(12, Number(style.fontSize) || DEFAULT_STYLE.fontSize),
      color: style.color || DEFAULT_STYLE.color,
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

  function parseConfigFromUrl(search) {
    search = search || location.search;
    var encoded = getQueryParam('c', search);
    if (!encoded) {
      return { items: [], style: normalizeStyle(), parseError: null };
    }
    try {
      var data = JSON.parse(fromBase64Url(encoded));
      return {
        items: Array.isArray(data.items) ? data.items : [],
        style: normalizeStyle(data.style),
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
    if (s.bg) {
      overlay.className = 'menu-overlay has-bg';
    } else {
      overlay.className = 'menu-overlay';
    }
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

      var icon = document.createElement('img');
      icon.className = 'gift-icon';
      icon.alt = '';
      icon.referrerPolicy = 'no-referrer';
      icon.src = resolveIcon(item.icon || '');
      icon.onerror = function () { icon.style.visibility = 'hidden'; };

      var body = document.createElement('div');
      body.className = 'item-body';

      var main = document.createElement('div');
      main.className = 'item-main';
      main.innerHTML = '<span class="count">x' + (item.count || 1) + '</span>' + escapeHtml(item.text);
      body.appendChild(main);

      li.appendChild(icon);
      li.appendChild(body);
      list.appendChild(li);
    });

    root.innerHTML = '';
    root.appendChild(list);
  }

  function boot() {
    var root = document.getElementById('menu-root');
    if (!root) return;
    try {
      renderMenu(root, parseConfigFromUrl());
    } catch (e) {
      root.innerHTML = '<div class="menu-empty">页面脚本异常，请刷新浏览器源</div>';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
