/* 동동 링크 모음 — 쿠팡 파트너스 링크 연결
 * index.html 상단의 window.LINKTREE.links 값으로 먼저 그린 뒤,
 * 웹에 올라가 있어 links.json 을 읽을 수 있으면 그 값으로 덮어씁니다.
 * (파일로 열었을 때도 동작하도록 인라인 값이 기본값입니다.)
 */
(function (global) {
  'use strict';

  var COUPANG_PREFIX = 'https://link.coupang.com/';
  var READY_LABEL = '쿠팡에서 보기';
  var PENDING_LABEL = '링크 준비 중';

  function isReady(url) {
    if (typeof url !== 'string') return false;
    var trimmed = url.replace(/^\s+|\s+$/g, '');
    return trimmed.indexOf(COUPANG_PREFIX) === 0 && trimmed.length > COUPANG_PREFIX.length + 2;
  }

  function mergeLinks(base, override) {
    var out = {};
    var k;
    base = base || {};
    override = override || {};
    for (k in base) { if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k]; }
    for (k in override) {
      if (Object.prototype.hasOwnProperty.call(override, k) && isReady(override[k])) out[k] = override[k];
    }
    return out;
  }

  function setPending(node, label) {
    node.setAttribute('href', '#');
    node.setAttribute('aria-disabled', 'true');
    node.setAttribute('tabindex', '-1');
    node.removeAttribute('target');
    node.removeAttribute('rel');
    if (('' + node.className).indexOf('is-pending') === -1) {
      node.className = (node.className ? node.className + ' ' : '') + 'is-pending';
    }
    if (label) label.textContent = PENDING_LABEL;
  }

  function setReady(node, url, label) {
    node.setAttribute('href', url);
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener sponsored');
    node.removeAttribute('aria-disabled');
    node.removeAttribute('tabindex');
    node.className = ('' + node.className).replace(/\s*is-pending\b/g, '').replace(/\s+/g, ' ').replace(/^\s|\s$/g, '');
    if (label) label.textContent = READY_LABEL;
  }

  function applyLinks(links, root) {
    var nodes = (root || global.document).querySelectorAll('[data-coupang]');
    var result = { applied: 0, pending: 0, unknown: [] };
    var i, node, key, url, label;
    for (i = 0; i < nodes.length; i++) {
      node = nodes[i];
      key = node.getAttribute('data-coupang');
      url = links ? links[key] : '';
      label = node.querySelector ? node.querySelector('.cta-label') : null;
      if (isReady(url)) {
        setReady(node, url, label);
        result.applied += 1;
      } else {
        setPending(node, label);
        result.pending += 1;
      }
      if (!links || !Object.prototype.hasOwnProperty.call(links, key)) result.unknown.push(key);
    }
    return result;
  }

  function fetchConfig() {
    if (typeof global.fetch !== 'function') return Promise.resolve(null);
    return global.fetch('links.json', { cache: 'no-store' })
      .then(function (res) { return res && res.ok ? res.json() : null; })
      .catch(function () { return null; });
  }

  function init() {
    if (!global.document || !global.document.querySelectorAll) return;
    var cfg = global.LINKTREE || {};
    var inline = cfg.links || {};
    var first = applyLinks(inline, global.document);
    if (global.document.documentElement) {
      global.document.documentElement.setAttribute('data-links-ready', String(first.applied));
    }
    fetchConfig().then(function (remote) {
      if (remote && remote.links) {
        var merged = mergeLinks(inline, remote.links);
        var second = applyLinks(merged, global.document);
        if (global.document.documentElement) {
          global.document.documentElement.setAttribute('data-links-ready', String(second.applied));
        }
      }
    });
  }

  global.LinkTree = {
    isReady: isReady,
    mergeLinks: mergeLinks,
    applyLinks: applyLinks,
    init: init,
    COUPANG_PREFIX: COUPANG_PREFIX
  };

  if (global.document && typeof global.document.addEventListener === 'function') {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})(typeof window !== 'undefined' ? window : this);
