#!/usr/bin/env python3
"""UI 렌더링 스모크 테스트.

브라우저가 없는 환경에서 index.html 의 실제 input 기본값을 그대로 재현한
최소 DOM 스텁을 만들고, app.js 의 init() 을 실행해 세 계산기의 결과가
기대값으로 렌더링되는지 확인합니다.

사용법: python3 tests/dom-smoke.py
"""
import json
import pathlib
import re
import sys
from html.parser import HTMLParser

try:
    import quickjs
except ImportError:
    sys.exit("quickjs 가 필요합니다: pip install quickjs")

ROOT = pathlib.Path(__file__).resolve().parent.parent
html = (ROOT / "index.html").read_text(encoding="utf-8")
app_js = (ROOT / "app.js").read_text(encoding="utf-8")


class Collector(HTMLParser):
    """index.html 의 요소를 (tag, attrs) 로 수집."""

    def __init__(self):
        super().__init__()
        self.items = []
        self.void = {"meta", "link", "br", "img", "input", "hr", "source",
                     "area", "base", "col", "embed", "param", "track", "wbr"}

    def handle_starttag(self, tag, attrs):
        self.items.append((tag, dict(attrs)))

    def handle_startendtag(self, tag, attrs):
        self.items.append((tag, dict(attrs)))


c = Collector()
c.feed(html)

ids = {}
attrs_by_tag = []
current_select = None
for tag, a in c.items:
    attrs_by_tag.append({"tag": tag, **{k: v for k, v in a.items() if v is not None}})
    if tag == "select" and "id" in a:
        current_select = a["id"]
        ids[a["id"]] = {"tag": tag, "value": ""}
    elif tag == "option" and current_select and "value" in a:
        if ids[current_select]["value"] == "":
            ids[current_select]["value"] = a["value"]
    elif tag != "option" and tag not in ("optgroup",):
        if tag != "select":
            current_select = None if tag not in ("option",) else current_select
    if "id" in a and tag != "select":
        el = {"tag": tag}
        if a.get("value") is not None:
            el["value"] = a["value"]
        if "checked" in a:
            el["checked"] = True
        if a.get("type") == "date":
            el["value"] = a.get("value") or ""
        ids[a["id"]] = el

elements_json = json.dumps(attrs_by_tag)
ids_json = json.dumps(ids)

stub = r"""
(function () {
  var ELEMENTS = __ELEMENTS__;
  var IDS = __IDS__;

  function matches(el, selector) {
    // 지원: '.class', '[attr]', 'tag', 'tag[name="x"]', 'tag[name="x"]:checked'
    var m = selector.match(/^([a-zA-Z]*)(?:\[([\w-]+)(?:="([^"]*)")?\])?(:[\w-]+)?$/);
    if (!m) return false;
    var tag = m[1], attr = m[2], val = m[3], pseudo = m[4];
    if (tag && el.tag !== tag) return false;
    if (attr) {
      if (!(attr in el)) return false;
      if (val !== undefined && String(el[attr]) !== val) return false;
    }
    if (pseudo === ':checked' && el.checked !== true) return false;
    return true;
  }

  function selectAll(selector) {
    var parts = selector.split(',').map(function (s) { return s.trim(); });
    var out = [];
    parts.forEach(function (sel) {
      ELEMENTS.forEach(function (el) {
        if (matches(el, sel) && out.indexOf(el) < 0) out.push(el);
      });
    });
    return out;
  }

  function makeNode(id) {
    var spec = IDS[id] || { tag: 'div' };
    var node = {
      id: id,
      tagName: (spec.tag || 'div').toUpperCase(),
      value: spec.value !== undefined ? spec.value : '',
      checked: !!spec.checked,
      textContent: '',
      innerHTML: '',
      hidden: false,
      className: '',
      style: {},
      tabIndex: 0,
      tabindex: 0,
      parentNode: null,
      attrs: {},
      _listeners: {},
      classList: {
        toggle: function (c, on) { node.className = on ? c : node.className.replace(c, ''); },
        add: function (c) { node.className += ' ' + c; },
        remove: function (c) { node.className = node.className.split(' ').filter(function (x) { return x !== c; }).join(' '); },
        contains: function (c) { return node.className.split(' ').indexOf(c) >= 0; }
      },
      addEventListener: function (ev, fn) {
        (node._listeners[ev] = node._listeners[ev] || []).push(fn);
      },
      setAttribute: function (k, v) { node.attrs[k] = v; },
      getAttribute: function (k) { return node.attrs[k] !== undefined ? node.attrs[k] : null; },
      focus: function () {},
      querySelectorAll: function (sel) {
        return ELEMENTS.filter(function (e) { return e.parentNode === node && matches(e, sel); });
      },
      appendChild: function () {},
      removeChild: function () {}
    };
    return node;
  }

  var BY_ID = {};
  Object.keys(IDS).forEach(function (id) { BY_ID[id] = makeNode(id); });

  // 부모·자식 관계는 사용하지 않으므로 단순 연결
  var CHIPS = [];
  var TABS = [];
  var PANELS = [];
  var RADIOS = {};

  ELEMENTS.forEach(function (spec) {
    var node = spec.id && BY_ID[spec.id] ? BY_ID[spec.id] : makeNode(spec.id || ('anon-' + Math.random()));
    Object.keys(spec).forEach(function (k) {
      if (k === 'tag') return;
      if (k === 'data-set' || k === 'data-tab' || k === 'data-panel' || k === 'data-copy') node.attrs[k] = spec[k];
      if (k === 'checked') node.checked = true;
      if (k === 'name') node.attrs.name = spec.name;
      if (k === 'type') node.attrs.type = spec.type;
      if (k === 'role') node.attrs.role = spec.role;
    });
    if (spec['data-set']) { node.parentNode = { querySelectorAll: function () { return CHIPS; } }; CHIPS.push(node); }
    if (spec['data-tab']) TABS.push(node);
    if (spec['data-panel']) { PANELS.push(node); }
    if (spec['data-copy']) { /* 복사 버튼 */ }
    if (spec.tag === 'input' && spec.name) {
      RADIOS[spec.name] = RADIOS[spec.name] || [];
      RADIOS[spec.name].push(node);
    }
  });

  var document = {
    readyState: 'complete',
    getElementById: function (id) { return BY_ID[id] || NULL_NODE; },
    querySelector: function (sel) { var r = selectAll(sel); return r.length ? r[0] : null; },
    querySelectorAll: function (sel) {
      if (sel === '[data-tab]') return TABS;
      if (sel === '[data-panel]') return PANELS;
      if (sel.indexOf('[data-set]') >= 0) return CHIPS;
      if (sel.indexOf('[data-copy]') >= 0) return [];
      if (sel.indexOf('input[name=') >= 0 && sel.indexOf(':checked') >= 0) {
        var name = sel.match(/name="([^"]+)"/)[1];
        var checkedOnes = RADIOS[name] || [];
        if (checkedOnes.length) {
          var picked = checkedOnes.filter(function (n) { return n.checked; });
          if (!picked.length) { checkedOnes[0].checked = true; picked = [checkedOnes[0]]; }
          return picked;
        }
        return [];
      }
      if (sel.indexOf('input[name=') >= 0) {
        var names = (sel.match(/name="([^"]+)"/g) || []).map(function (s) { return s.slice(6, -1); });
        var out = [];
        names.forEach(function (n) { (RADIOS[n] || []).forEach(function (x) { out.push(x); }); });
        return out;
      }
      return [];
    },
    addEventListener: function () {},
    createElement: function () {
      return { style: {}, setAttribute: function () {}, select: function () {} };
    },
    body: { appendChild: function () {}, removeChild: function () {} },
    execCommand: function () { return true; },
    title: ''
  };

  var NULL_NODE = { value: '', checked: false, textContent: '', innerHTML: '', style: {}, hidden: false,
    addEventListener: function () {}, classList: { toggle: function () {}, add: function () {}, remove: function () {} },
    setAttribute: function () {}, getAttribute: function () { return null; }, querySelectorAll: function () { return []; } };

  var window = {
    document: document,
    addEventListener: function () {},
    history: { replaceState: function () {} },
    location: { hash: '' },
    navigator: { clipboard: null },
    setTimeout: function () {},
    Date: Date
  };

  globalThis.window = window;
  globalThis.document = document;
  globalThis.history = window.history;
  globalThis.location = window.location;
  globalThis.navigator = window.navigator;
  globalThis.setTimeout = function () {};

  // 스텁을 전역에 노출해 테스트에서 결과를 읽을 수 있게 한다
  globalThis.__BY_ID = BY_ID;
  globalThis.__TABS = TABS;
})();
"""

stub = stub.replace("__ELEMENTS__", elements_json).replace("__IDS__", ids_json)

ctx = quickjs.Context()
ctx.eval("globalThis.console = { log: function (s) { __log(String(s)); } };")
ctx.add_callable("__log", lambda s: print(s))

errors = []
try:
    ctx.eval(stub)
    ctx.eval(app_js)
except Exception as exc:  # noqa: BLE001
    print("JS 실행 오류:", exc)
    sys.exit(1)

def text(el_id):
    return ctx.eval(f"__BY_ID['{el_id}'].textContent")


checks = []
checks.append(("청약가점 총점", text("cy-total"), "38점"))
checks.append(("청약가점 표 합계", text("cy-total-2"), "38점"))
checks.append(("무주택 점수", text("cy-own-pts"), "16점"))
checks.append(("부양가족 점수", text("cy-dep-pts"), "15점"))
checks.append(("통장 점수", text("cy-acc-pts"), "7점"))
checks.append(("가점 등급", text("cy-grade"), "추첨제 중심"))
checks.append(("DSR 값", text("dsr-dsr-value"), "42.0%"))
checks.append(("DSR 배지", text("dsr-badge"), "한도 초과"))
checks.append(("DSR 산정금리", text("dsr-checked-rate"), "7.50%"))
checks.append(("DSR 월 상환액", text("dsr-monthly"), "1,520,056원"))
checks.append(("취득세 합계", text("ac-total"), "6,600,000원"))
checks.append(("취득세 한글 표기", text("ac-total-ko"), "660만원"))
checks.append(("취득세 세율", text("ac-rate"), "1%"))
checks.append(("취득세 적용 근거", text("ac-basis"), "1주택 → 일반세율 1.00%"))

fail = 0
for name, actual, expected in checks:
    ok = str(actual) == expected
    if not ok:
        fail += 1
    print(("PASS " if ok else "FAIL ") + name + " | 기대 " + expected + " / 실제 " + str(actual))

print()
print(f"=== UI 스모크: PASS {len(checks) - fail} / FAIL {fail} (총 {len(checks)}) ===")
sys.exit(1 if fail else 0)
