/**
 * 2048 界面逻辑 v1.1
 * ------------------------------------------------------------------
 * v1.0 → v1.1 的迭代内容（对应 PLAN.md 的 I-1 ~ I-4）：
 *   I-1 AI 托管 + 提示按钮（接 js/ai.js 的 Expectimax 搜索）
 *   I-2 撤销（状态快照栈）
 *   I-3 触摸滑动 + 响应式
 *   I-4 新方块/合并动画、分数浮动、刷新续玩
 * 计算全部委托给 js/board.js 与 js/ai.js（纯函数），这里只做显示与交互。
 */
(function () {
  'use strict';

  var B = window.Board2048;
  var AI = window.Ai2048;

  var BEST_KEY = 'tile2048.best';
  var STATE_KEY = 'tile2048.state';
  var HISTORY_LIMIT = 20;
  var SWIPE_MIN = 24;      // 触摸滑动的最小位移（px），低于此值视为点击

  var DIRECTION_LABEL = { up: '↑ 向上', down: '↓ 向下', left: '← 向左', right: '→ 向右' };

  var el = {
    board: document.getElementById('board'),
    scoreBox: document.getElementById('score-box'),
    score: document.getElementById('score'),
    best: document.getElementById('best'),
    grid: document.getElementById('grid'),
    tiles: document.getElementById('tiles'),
    hintBadge: document.getElementById('hint-badge'),
    overlay: document.getElementById('overlay'),
    overlayTitle: document.getElementById('overlay-title'),
    overlayText: document.getElementById('overlay-text'),
    overlayBtn: document.getElementById('overlay-btn'),
    newGame: document.getElementById('new-game'),
    undo: document.getElementById('undo'),
    hint: document.getElementById('hint'),
    autoplay: document.getElementById('autoplay'),
    speed: document.getElementById('speed')
  };

  var state = {
    board: B.emptyBoard(),
    score: 0,
    best: readBest(),
    history: [],
    over: false,
    won: false,
    keepPlaying: false
  };

  var autoplayOn = false;
  var autoplayTimer = null;
  var hintTimer = null;

  /* ---------------- 本地存储 ---------------- */

  function readBest() {
    try {
      return parseInt(window.localStorage.getItem(BEST_KEY), 10) || 0;
    } catch (e) {
      return 0; // 隐私模式等场景下不可用，降级为不记录
    }
  }

  function saveBest() {
    try {
      window.localStorage.setItem(BEST_KEY, String(state.best));
    } catch (e) { /* 忽略 */ }
  }

  function saveGame() {
    try {
      window.localStorage.setItem(STATE_KEY, JSON.stringify({
        board: state.board,
        score: state.score,
        over: state.over,
        won: state.won,
        keepPlaying: state.keepPlaying
      }));
    } catch (e) { /* 忽略 */ }
  }

  /** 读取存档并做形状/数值校验，脏数据直接丢弃 */
  function loadGame() {
    var raw;
    try {
      raw = window.localStorage.getItem(STATE_KEY);
    } catch (e) {
      return null;
    }
    if (!raw) return null;

    try {
      var saved = JSON.parse(raw);
      if (!saved || !Array.isArray(saved.board) || saved.board.length !== B.SIZE) return null;
      for (var r = 0; r < B.SIZE; r++) {
        var row = saved.board[r];
        if (!Array.isArray(row) || row.length !== B.SIZE) return null;
        for (var c = 0; c < B.SIZE; c++) {
          var v = row[c];
          if (typeof v !== 'number' || v < 0 || (v !== 0 && (v & (v - 1)) !== 0)) return null; // 必须是 0 或 2 的幂
        }
      }
      return {
        board: saved.board,
        score: typeof saved.score === 'number' && saved.score >= 0 ? saved.score : 0,
        over: !!saved.over,
        won: !!saved.won,
        keepPlaying: !!saved.keepPlaying
      };
    } catch (e) {
      return null;
    }
  }

  /* ---------------- 渲染 ---------------- */

  function buildGrid() {
    for (var i = 0; i < B.SIZE * B.SIZE; i++) {
      var cell = document.createElement('div');
      cell.className = 'cell';
      el.grid.appendChild(cell);
    }
  }

  function tileClass(value) {
    return 'tile tile-' + (value > 2048 ? 'super' : value);
  }

  function isMergedAt(merged, r, c) {
    if (!merged) return false;
    for (var i = 0; i < merged.length; i++) {
      if (merged[i][0] === r && merged[i][1] === c) return true;
    }
    return false;
  }

  /**
   * 重绘棋盘
   * @param {{merged: number[][], spawn: {r: number, c: number}|null}} [anim] 动画信息
   */
  function render(anim) {
    el.tiles.innerHTML = '';

    for (var r = 0; r < B.SIZE; r++) {
      for (var c = 0; c < B.SIZE; c++) {
        var value = state.board[r][c];
        if (!value) continue;

        var tile = document.createElement('div');
        tile.className = tileClass(value);
        if (anim && anim.spawn && anim.spawn.r === r && anim.spawn.c === c) {
          tile.classList.add('tile-new');
        } else if (anim && isMergedAt(anim.merged, r, c)) {
          tile.classList.add('tile-merged');
        }
        tile.textContent = value;
        tile.style.setProperty('--r', r);
        tile.style.setProperty('--c', c);
        el.tiles.appendChild(tile);
      }
    }

    el.score.textContent = state.score;
    el.best.textContent = state.best;
    el.undo.disabled = state.history.length === 0;
  }

  function floatScore(points) {
    var bubble = document.createElement('span');
    bubble.className = 'score-float';
    bubble.textContent = '+' + points;
    el.scoreBox.appendChild(bubble);
    window.setTimeout(function () {
      if (bubble.parentNode) bubble.parentNode.removeChild(bubble);
    }, 700);
  }

  /* ---------------- 提示 ---------------- */

  function clearHint() {
    window.clearTimeout(hintTimer);
    el.hintBadge.classList.add('hidden');
  }

  function showHint() {
    if (state.over) return;
    var choice = AI.hint(state.board);
    if (!choice) return;

    el.hintBadge.textContent = 'AI 建议：' + (DIRECTION_LABEL[choice.direction] || choice.direction);
    el.hintBadge.classList.remove('hidden');

    window.clearTimeout(hintTimer);
    hintTimer = window.setTimeout(clearHint, 1800);
  }

  /* ---------------- 结算遮罩 ---------------- */

  function showOverlay(title, text, buttonLabel, onClick) {
    el.overlayTitle.textContent = title;
    el.overlayText.textContent = text;
    el.overlayBtn.textContent = buttonLabel;
    el.overlayBtn.onclick = onClick;
    el.overlay.classList.remove('hidden');
  }

  function hideOverlay() {
    el.overlay.classList.add('hidden');
  }

  /* ---------------- 对局流程 ---------------- */

  function newGame() {
    stopAutoplay();
    clearHint();
    state.board = B.createBoard();
    state.score = 0;
    state.history = [];
    state.over = false;
    state.won = false;
    state.keepPlaying = false;
    hideOverlay();
    render();
    saveGame();
  }

  function pushHistory() {
    state.history.push({
      board: B.cloneBoard(state.board),
      score: state.score,
      over: state.over,
      won: state.won,
      keepPlaying: state.keepPlaying
    });
    if (state.history.length > HISTORY_LIMIT) state.history.shift();
  }

  function undo() {
    if (state.history.length === 0) return;
    stopAutoplay();
    clearHint();

    var prev = state.history.pop();
    state.board = prev.board;
    state.score = prev.score;
    state.over = prev.over;
    state.won = prev.won;
    state.keepPlaying = prev.keepPlaying;

    hideOverlay();
    render();
    saveGame();
  }

  function applyMove(direction) {
    if (state.over) return false;
    if (state.won && !state.keepPlaying) return false; // 胜利遮罩期间暂停

    var result = B.move(state.board, direction);
    if (!result.moved) return false; // 无效方向：不生成新方块

    pushHistory();
    state.board = result.board;
    state.score += result.score;
    if (state.score > state.best) {
      state.best = state.score;
      saveBest();
    }

    var spawned = B.addRandomTile(state.board);
    if (spawned) state.board = spawned.board;
    clearHint();

    var won = false;
    if (!state.won && B.isWin(state.board)) {
      state.won = true;
      won = true;
    }

    render({ merged: result.merged, spawn: spawned ? spawned.tile : null });
    if (result.score > 0) floatScore(result.score);
    saveGame();

    if (won) {
      showOverlay('🎉 达成 2048！', '本局得分 ' + state.score + '，要继续挑战更大的数字吗？', '继续挑战', function () {
        state.keepPlaying = true;
        hideOverlay();
      });
    } else if (!B.hasMoves(state.board)) {
      state.over = true;
      stopAutoplay();
      render();
      saveGame();
      showOverlay('游戏结束', '本局得分 ' + state.score + '，再来一局？', '再来一局', newGame);
    }

    return true;
  }

  /* ---------------- AI 托管 ---------------- */

  function autoplayDelay() {
    return parseInt(el.speed.value, 10) || 140;
  }

  function startAutoplay() {
    if (autoplayOn) return;
    if (state.over) return;

    autoplayOn = true;
    el.autoplay.classList.add('active');
    el.autoplay.textContent = '停止托管';
    tick();
  }

  function stopAutoplay() {
    autoplayOn = false;
    window.clearTimeout(autoplayTimer);
    el.autoplay.classList.remove('active');
    el.autoplay.textContent = 'AI 托管';
  }

  function tick() {
    if (!autoplayOn) return;

    if (state.over) {
      stopAutoplay();
      return;
    }

    // 胜利遮罩期间先暂停，等玩家点「继续挑战」
    if (state.won && !state.keepPlaying) {
      autoplayTimer = window.setTimeout(tick, 300);
      return;
    }

    var choice = AI.bestMove(state.board);
    if (!choice) {
      stopAutoplay();
      return;
    }

    applyMove(choice.direction);
    if (autoplayOn && !state.over) {
      autoplayTimer = window.setTimeout(tick, autoplayDelay());
    }
  }

  /* ---------------- 输入 ---------------- */

  var KEYS = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down',
    a: 'left',
    d: 'right',
    w: 'up',
    s: 'down'
  };

  document.addEventListener('keydown', function (event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return; // 不抢系统快捷键
    var key = String(event.key);
    var lower = key.toLowerCase();

    if (lower === 'z') {
      event.preventDefault();
      undo();
      return;
    }
    if (lower === 'h') {
      event.preventDefault();
      showHint();
      return;
    }

    var direction = KEYS[key] || KEYS[lower];
    if (!direction) return;
    event.preventDefault();
    stopAutoplay(); // 玩家一操作就交还控制权
    applyMove(direction);
  });

  /* 触摸滑动（移动端） */
  var touchStart = null;

  el.board.addEventListener('touchstart', function (event) {
    if (event.touches.length !== 1) return;
    touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }, { passive: true });

  el.board.addEventListener('touchend', function (event) {
    if (!touchStart) return;
    var touch = event.changedTouches[0];
    var dx = touch.clientX - touchStart.x;
    var dy = touch.clientY - touchStart.y;
    touchStart = null;

    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return; // 视为点击
    stopAutoplay();
    if (Math.abs(dx) > Math.abs(dy)) applyMove(dx > 0 ? 'right' : 'left');
    else applyMove(dy > 0 ? 'down' : 'up');
  }, { passive: true });

  /* 按钮 */
  el.newGame.addEventListener('click', newGame);
  el.undo.addEventListener('click', undo);
  el.hint.addEventListener('click', showHint);
  el.autoplay.addEventListener('click', function () {
    if (autoplayOn) stopAutoplay();
    else startAutoplay();
  });
  el.speed.addEventListener('change', function () {
    if (autoplayOn) {
      window.clearTimeout(autoplayTimer);
      autoplayTimer = window.setTimeout(tick, autoplayDelay());
    }
  });

  /* 切到后台时暂停托管，回来再继续（省电，也避免后台定时器堆积） */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      window.clearTimeout(autoplayTimer);
    } else if (autoplayOn) {
      autoplayTimer = window.setTimeout(tick, autoplayDelay());
    }
  });

  /* ---------------- 启动 ---------------- */

  buildGrid();

  var saved = loadGame();
  if (saved) {
    state.board = saved.board;
    state.score = saved.score;
    state.over = saved.over;
    state.won = saved.won;
    state.keepPlaying = saved.keepPlaying;
    render();
    if (state.over) {
      showOverlay('游戏结束', '本局得分 ' + state.score + '，再来一局？', '再来一局', newGame);
    }
  } else {
    newGame();
  }
})();
