#!/usr/bin/env bash
# ============================================================
# 浏览器冒烟自测
# ------------------------------------------------------------
# 单元测试只能证明「纯逻辑」是对的，证明不了「页面里真的能玩」。
# 这个脚本把 tools/smoke-assert.js 注入 index.html 的临时副本，
# 用无头 Chrome 真的点按钮、真的按方向键，最后检查有无 JS 报错。
#
# 用法：bash tools/browser-smoke.sh
# 指定别的浏览器：CHROME=/path/to/chrome bash tools/browser-smoke.sh
# ============================================================
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
HARNESS="$ROOT/.smoke.html"
DOM_LOG="$(mktemp -t tile2048-dom)"
PROFILE="$(mktemp -d -t tile2048-profile)"
MAX_WAIT=40   # 秒；拿到结果就提前退出（无头 Chrome 有时退出会卡住）

cleanup() {
  rm -f "$HARNESS"
  rm -rf "$PROFILE"
}
trap cleanup EXIT

if [ ! -x "$CHROME" ]; then
  echo "❌ 找不到 Chrome：$CHROME"
  echo "   可以用 CHROME=/path/to/chrome 指定其它 Chromium 内核浏览器"
  exit 2
fi

python3 - "$ROOT" "$HARNESS" <<'PY'
import io, os, sys

root, harness = sys.argv[1], sys.argv[2]
html = io.open(os.path.join(root, 'index.html'), encoding='utf-8').read()

catcher = ('<script>window.__errors=[];window.addEventListener("error",'
           'function(e){window.__errors.push(String(e.message));});</script>')
html = html.replace('<head>', '<head>' + catcher, 1)

assertion = io.open(os.path.join(root, 'tools', 'smoke-assert.js'), encoding='utf-8').read()
html = html.replace('</body>', '<script>' + assertion + '</script></body>', 1)

io.open(harness, 'w', encoding='utf-8').write(html)
PY

if [ ! -f "$HARNESS" ]; then
  echo "❌ 注入断言脚本失败"
  exit 1
fi

"$CHROME" \
  --headless=new --disable-gpu --no-sandbox --no-first-run \
  --disable-background-networking --disable-component-update --disable-sync \
  --disable-default-apps --disable-extensions \
  --user-data-dir="$PROFILE" --virtual-time-budget=9000 \
  --dump-dom "file://$HARNESS" > "$DOM_LOG" 2>/dev/null &
CHROME_PID=$!

LINE=""
for _ in $(seq 1 "$MAX_WAIT"); do
  if grep -q 'SMOKE-DONE' "$DOM_LOG" 2>/dev/null; then
    LINE="$(grep -o 'RESULT [^<]*SMOKE-DONE' "$DOM_LOG" | head -1)"
    break
  fi
  sleep 1
done

kill "$CHROME_PID" 2>/dev/null
wait "$CHROME_PID" 2>/dev/null

if [ -z "$LINE" ]; then
  echo "❌ 冒烟失败：${MAX_WAIT}s 内没拿到结果（页面可能没加载，或 JS 直接抛错）"
  exit 1
fi

echo "$LINE" | sed 's/ SMOKE-DONE$//' | sed 's/ | /\n  /g'

if echo "$LINE" | grep -q 'errors=\[\]'; then
  echo "✅ 浏览器冒烟通过：页面可正常游玩，且无 JS 报错"
  exit 0
fi

echo "❌ 浏览器里出现 JS 报错，见上面的 errors 字段"
exit 1
