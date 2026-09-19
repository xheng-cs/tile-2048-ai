/**
 * 2048 界面逻辑 v1.0
 * ------------------------------------------------------------------
 * 职责：DOM 渲染、键盘输入、计分与最高分持久化、胜负结算。
 * 计算全部委托给 js/board.js（纯函数），这里只做「显示」和「交互」。
 */
(function () {
  'use strict';

  var B = window.Board2048;
  var BEST_KEY = 'tile2048.best';

  var el = {
    score: document.getElementById('score'),
    best: document.getElementById('best'),
    grid: document.getElementById('grid'),
    tiles: document.getElementById('tiles'),
    overlay: document.getElementById('overlay'),
    overlayTitle: document.getElementById('overlay-title'),
    overlayText: document.getElementById('overlay-text'),
    overlayBtn: document.getElementById('overlay-btn'),
    newGame: document.getElementById('new-game')
  };

  var state = {
    board: B.emptyBoard(),
    score: 0,
    best: readBest(),
    over: false,
    won: false,
    keepPlaying: false
  };

  /* ---------------- 最高分存取 ---------------- */

  function readBest() {
    try {
      return parseInt(window.localStorage.getItem(BEST_KEY), 10) || 0;
    } catch (e) {
      return 0; // 隐私模式等场景下 localStorage 不可用，降级为不记录
    }
  }

  function saveBest() {
    try {
      window.localStorage.setItem(BEST_KEY, String(state.best));
    } catch (e) { /* 忽略：不影响游戏 */ }
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

  function render() {
    el.tiles.innerHTML = '';
    for (var r = 0; r < B.SIZE; r++) {
      for (var c = 0; c < B.SIZE; c++) {
        var value = state.board[r][c];
        if (!value) continue;
        var tile = document.createElement('div');
        tile.className = tileClass(value);
        tile.textContent = value;
        tile.style.setProperty('--r', r);
        tile.style.setProperty('--c', c);
        el.tiles.appendChild(tile);
      }
    }
    el.score.textContent = state.score;
    el.best.textContent = state.best;
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

  /* ---------------- 游戏流程 ---------------- */

  function newGame() {
    state.board = B.createBoard();
    state.score = 0;
    state.over = false;
    state.won = false;
    state.keepPlaying = false;
    hideOverlay();
    render();
  }

  function applyMove(direction) {
    if (state.over) return;
    if (state.won && !state.keepPlaying) return; // 胜利遮罩期间先暂停

    var result = B.move(state.board, direction);
    if (!result.moved) return; // 无效方向：不生成新方块

    state.board = result.board;
    state.score += result.score;
    if (state.score > state.best) {
      state.best = state.score;
      saveBest();
    }

    var spawned = B.addRandomTile(state.board);
    if (spawned) state.board = spawned.board;

    if (!state.won && B.isWin(state.board)) {
      state.won = true;
      showOverlay('🎉 达成 2048！', '本局得分 ' + state.score + '，要继续挑战更大的数字吗？', '继续挑战', function () {
        state.keepPlaying = true;
        hideOverlay();
      });
    } else if (!B.hasMoves(state.board)) {
      state.over = true;
      showOverlay('游戏结束', '本局得分 ' + state.score + '，再来一局？', '再来一局', newGame);
    }

    render();
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
    var key = event.key;
    var direction = KEYS[key] || KEYS[String(key).toLowerCase()];
    if (!direction) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return; // 别抢系统快捷键
    event.preventDefault();
    applyMove(direction);
  });

  el.newGame.addEventListener('click', newGame);

  /* ---------------- 启动 ---------------- */

  buildGrid();
  newGame();
})();
