#!/usr/bin/env python3
"""app.js 계산 엔진 검증 실행기 (QuickJS).

사용법: python3 tests/run.py
"""
import pathlib
import sys

try:
    import quickjs
except ImportError:
    sys.exit("quickjs 가 필요합니다: pip install quickjs")

ROOT = pathlib.Path(__file__).resolve().parent.parent
app = (ROOT / "app.js").read_text(encoding="utf-8")
tests = (ROOT / "tests" / "run-tests.js").read_text(encoding="utf-8")

ctx = quickjs.Context()
ctx.eval(
    "globalThis.console = { log: function (s) { __log(String(s)); } };"
    "globalThis.print = function (s) { __log(String(s)); };"
    "if (typeof globalThis.window === 'undefined') { /* node 없음 */ }"
)
ctx.add_callable("__log", lambda s: print(s))
ctx.eval(app)
ctx.eval(tests)
