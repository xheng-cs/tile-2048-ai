/**
 * 2048 核心棋盘逻辑
 * ------------------------------------------------------------------
 * · 纯函数：不依赖 DOM、不依赖全局状态，可在 Node 里直接单元测试
 * · 浏览器：<script src="js/board.js"> 得到 window.Board2048
 * · Node   ：const Board = require('./js/board.js')
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Board2048 = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SIZE = 4;
  var WIN_TILE = 2048;
  var SPAWN_FOUR_RATE = 0.1; // 新方块有 10% 概率是 4，其余是 2

  var DIRECTIONS = {
    left:  { horizontal: true,  reverse: false },
    right: { horizontal: true,  reverse: true  },
    up:    { horizontal: false, reverse: false },
    down:  { horizontal: false, reverse: true  }
  };

  /** 生成 size×size 的全 0 棋盘 */
  function emptyBoard(size) {
    var n = size || SIZE;
    var board = [];
    for (var r = 0; r < n; r++) {
      var row = [];
      for (var c = 0; c < n; c++) row.push(0);
      board.push(row);
    }
    return board;
  }

  /** 深拷贝棋盘（move 是纯函数，绝不修改入参） */
  function cloneBoard(board) {
    return board.map(function (row) { return row.slice(); });
  }

  function boardsEqual(a, b) {
    for (var r = 0; r < a.length; r++) {
      for (var c = 0; c < a.length; c++) {
        if (a[r][c] !== b[r][c]) return false;
      }
    }
    return true;
  }

  /** 所有空位的坐标 */
  function emptyCells(board) {
    var cells = [];
    for (var r = 0; r < board.length; r++) {
      for (var c = 0; c < board.length; c++) {
        if (board[r][c] === 0) cells.push([r, c]);
      }
    }
    return cells;
  }

  /** 新方块数值：按 SPAWN_FOUR_RATE 决定是 2 还是 4 */
  function spawnValue(rand) {
    return rand() < SPAWN_FOUR_RATE ? 4 : 2;
  }

  /**
   * 单行向左滑动并合并（其他方向都归约到这里）
   * @returns {{row: number[], score: number, merged: number[]}}
   *          merged 为「合并后落点」在该行中的下标，供界面做合并动画
   */
  function slideRow(row) {
    var values = row.filter(function (v) { return v !== 0; });
    var out = [];
    var merged = [];
    var score = 0;
    var i = 0;

    while (i < values.length) {
      if (i + 1 < values.length && values[i] === values[i + 1]) {
        var value = values[i] * 2;
        merged.push(out.length);
        out.push(value);
        score += value;
        i += 2; // 关键：一对相同数字本次只合并一次，新生成的方块不再参与合并
      } else {
        out.push(values[i]);
        i += 1;
      }
    }

    while (out.length < row.length) out.push(0);
    return { row: out, score: score, merged: merged };
  }

  /** 某个方向上第 index 条线的坐标，按「落点顺序」排列（right/down 会被翻转） */
  function lineCoords(dir, index, size) {
    var coords = [];
    for (var k = 0; k < size; k++) {
      coords.push(dir.horizontal ? [index, k] : [k, index]);
    }
    if (dir.reverse) coords.reverse();
    return coords;
  }

  /**
   * 执行一次移动（纯函数）
   * @returns {{board: number[][], score: number, moved: boolean, merged: number[][]}}
   */
  function move(board, direction) {
    var dir = DIRECTIONS[direction];
    if (!dir) throw new Error('未知方向：' + direction);

    var size = board.length;
    var next = emptyBoard(size);
    var mergedCells = [];
    var score = 0;

    for (var index = 0; index < size; index++) {
      var coords = lineCoords(dir, index, size);
      var values = coords.map(function (rc) { return board[rc[0]][rc[1]]; });
      var result = slideRow(values);

      score += result.score;
      for (var k = 0; k < size; k++) {
        var rc = coords[k];
        next[rc[0]][rc[1]] = result.row[k];
      }
      for (var m = 0; m < result.merged.length; m++) {
        mergedCells.push(coords[result.merged[m]]);
      }
    }

    return {
      board: next,
      score: score,
      moved: !boardsEqual(board, next),
      merged: mergedCells
    };
  }

  /**
   * 在随机空位放一个新方块
   * @returns {{board: number[][], tile: {r: number, c: number, value: number}}|null} 满盘返回 null
   */
  function addRandomTile(board, rand) {
    var random = rand || Math.random;
    var cells = emptyCells(board);
    if (cells.length === 0) return null;

    var pos = cells[Math.min(cells.length - 1, Math.floor(random() * cells.length))];
    var next = cloneBoard(board);
    var value = spawnValue(random);
    next[pos[0]][pos[1]] = value;
    return { board: next, tile: { r: pos[0], c: pos[1], value: value } };
  }

  /** 新开一局：初始两个方块 */
  function createBoard(rand) {
    var first = addRandomTile(emptyBoard(), rand);
    var second = addRandomTile(first.board, rand);
    return second.board;
  }

  function maxTile(board) {
    var max = 0;
    for (var r = 0; r < board.length; r++) {
      for (var c = 0; c < board.length; c++) {
        if (board[r][c] > max) max = board[r][c];
      }
    }
    return max;
  }

  function isWin(board) {
    return maxTile(board) >= WIN_TILE;
  }

  /** 还有空位或还有相邻可合并 → 还能继续玩 */
  function hasMoves(board) {
    var size = board.length;
    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        if (board[r][c] === 0) return true;
        if (c + 1 < size && board[r][c] === board[r][c + 1]) return true;
        if (r + 1 < size && board[r][c] === board[r + 1][c]) return true;
      }
    }
    return false;
  }

  return {
    SIZE: SIZE,
    WIN_TILE: WIN_TILE,
    SPAWN_FOUR_RATE: SPAWN_FOUR_RATE,
    DIRECTIONS: DIRECTIONS,
    emptyBoard: emptyBoard,
    cloneBoard: cloneBoard,
    boardsEqual: boardsEqual,
    emptyCells: emptyCells,
    spawnValue: spawnValue,
    slideRow: slideRow,
    move: move,
    addRandomTile: addRandomTile,
    createBoard: createBoard,
    maxTile: maxTile,
    isWin: isWin,
    hasMoves: hasMoves
  };
});
