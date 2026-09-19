/**
 * 浏览器冒烟断言脚本（由 tools/browser-smoke.sh 注入到 index.html 的副本里执行）
 * ------------------------------------------------------------------
 * 单元测试跑在 Node 里，覆盖不到「真实 DOM + 真实事件」这一层，
 * 这里就在无头 Chrome 里真的点按钮、真的按方向键，最后把结果写进页面，
 * 由 shell 脚本抓取 'SMOKE-DONE' 那一行。
 */
(function () {
  var PRE_ID = 'smoke-report';
  // 运行时拼出结束标记：源码里不会出现连续的 'SMOKE-DONE'，
  // 这样 shell 抓 DOM 时不会误抓到这段脚本自己的源码。
  var DONE_TAG = ['SMOKE', 'DONE'].join('-');
  var out = [];
  var errors = window.__errors || [];

  function report() {
    var pre = document.getElementById(PRE_ID);
    if (!pre) {
      pre = document.createElement('pre');
      pre.id = PRE_ID;
      document.body.appendChild(pre);
    }
    pre.textContent = 'RESULT ' + out.join(' | ') + (window.__smokeDone ? ' ' + DONE_TAG : '');
  }

  function press(key) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true }));
  }

  function click(id) {
    document.getElementById(id).click();
  }

  function tileCount() {
    return document.querySelectorAll('#tiles .tile').length;
  }

  function tilesHtml() {
    return document.getElementById('tiles').innerHTML;
  }

  function scoreValue() {
    return parseInt(document.getElementById('score').textContent, 10) || 0;
  }

  function maxTile() {
    var values = [].map.call(document.querySelectorAll('#tiles .tile'), function (t) {
      return Number(t.textContent) || 0;
    });
    values.push(0);
    return Math.max.apply(null, values);
  }

  function step1() {
    click('new-game');
    out.push('grid_cells=' + document.querySelectorAll('#grid .cell').length);
    out.push('new_game_tiles=' + tileCount());
    report();
    window.setTimeout(step2, 30);
  }

  function step2() {
    var before = { tiles: tilesHtml(), score: scoreValue() };
    var dirs = ['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'];
    var moved = false;
    for (var i = 0; i < 40 && !moved; i++) {
      press(dirs[i % 4]);
      if (tilesHtml() !== before.tiles || scoreValue() !== before.score) moved = true;
    }
    window.__smokeBefore = before;
    out.push('keyboard_moved=' + moved);
    out.push('tiles_after_move=' + tileCount());
    report();
    window.setTimeout(step3, 30);
  }

  function step3() {
    var before = window.__smokeBefore;
    click('undo');
    out.push('undo_restored=' + (tilesHtml() === before.tiles && scoreValue() === before.score));
    report();
    window.setTimeout(step4, 30);
  }

  function step4() {
    click('hint');
    var badge = document.getElementById('hint-badge');
    out.push('hint_visible=' + (!badge.classList.contains('hidden') && badge.textContent.length > 0));
    out.push('hint_text=' + badge.textContent);
    report();
    window.setTimeout(step5, 30);
  }

  function step5() {
    window.__smokeAutoplay = { score: scoreValue(), tiles: tilesHtml() };
    click('autoplay');
    out.push('autoplay_active=' + document.getElementById('autoplay').classList.contains('active'));
    report();
    window.setTimeout(step6, 2500); // 让无头浏览器快进虚拟时间，AI 走若干步
  }

  function step6() {
    var start = window.__smokeAutoplay;
    out.push('autoplay_progressed=' + (scoreValue() !== start.score || tilesHtml() !== start.tiles));
    out.push('autoplay_score=' + scoreValue());
    click('autoplay');
    out.push('autoplay_stopped=' + !document.getElementById('autoplay').classList.contains('active'));
    out.push('max_tile=' + maxTile());
    out.push('errors=' + JSON.stringify(errors));
    window.__smokeDone = true;
    report();
  }

  report();
  window.setTimeout(step1, 30);
})();
