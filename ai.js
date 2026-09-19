/**
 * 2048 AI —— Expectimax 搜索 + 启发式评估
 * ------------------------------------------------------------------
 * · 玩家移动 = max 节点：在 4 个方向里挑评估值最高的
 * · 随机出块 = chance 节点：对新方块可能出现的空位（2 与 4 按 0.9 / 0.1）求期望
 * · 评估函数 = 空格数 + 单调性 + 平滑度 + 最大数靠角（四项经典启发式加权）
 *
 * 设计要点：
 * 1. 不依赖随机数，同一个棋盘必然得到同一个决策 → 可被单元测试断言；
 * 2. chance 节点只展开前 N 个空位，把分支因子压下来，保证浏览器里每步几十毫秒；
 * 3. 搜索过程中直接改动自己 clone 出来的工作棋盘（不碰入参），换取速度。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./board.js'));
  } else {
    root.Ai2048 = factory(root.Board2048);
  }
})(typeof self !== 'undefined' ? self : this, function (Board) {
  'use strict';

  var DIRECTIONS = ['up', 'down', 'left', 'right'];

  var DEFAULTS = {
    // 由 tools/bench.js 实测选出：depth=5 + 机会节点只展开 4 个空位时，
    // 平均能合出 2048（平均得分 3 万+），每步搜索仅约 6ms。
    depth: 5,
    chanceBranchLimit: 4,  // 机会节点最多展开几个空位
    spawnRate4: 0.1,       // 新方块是 4 的概率
    maxMoves: 4000,        // 托管时的步数上限，防御性兜底
    weights: {
      empty: 2.7,     // 空格越多越安全
      monotonic: 1.0, // 行列保持单调，便于把大数堆在角落
      smooth: 0.3,    // 相邻数值差越小越好
      corner: 0.6     // 最大数待在角落加分
    }
  };

  function options(custom) {
    var opts = {};
    var key;
    for (key in DEFAULTS) if (Object.prototype.hasOwnProperty.call(DEFAULTS, key)) opts[key] = DEFAULTS[key];
    if (custom) {
      for (key in custom) {
        if (!Object.prototype.hasOwnProperty.call(custom, key)) continue;
        if (key === 'weights') {
          var w = {};
          var wk;
          for (wk in DEFAULTS.weights) w[wk] = DEFAULTS.weights[wk];
          for (wk in custom.weights) w[wk] = custom.weights[wk];
          opts.weights = w;
        } else {
          opts[key] = custom[key];
        }
      }
    }
    return opts;
  }

  /** 可复现的伪随机数发生器（测试与基准用） */
  function createRng(seed) {
    var state = (seed >>> 0) || 1;
    return function () {
      state += 0x6D2B79F5;
      var x = state;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------- 启发式评估 ---------------- */

  function log2(value) {
    return value > 0 ? Math.log(value) / Math.LN2 : 0;
  }

  function emptyCount(board) {
    return Board.emptyCells(board).length;
  }

  /** 平滑度：相邻非零方块的数值差越小越好（取对数后计算，避免大数独大） */
  function smoothness(board) {
    var size = board.length;
    var total = 0;
    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        var value = board[r][c];
        if (!value) continue;
        if (c + 1 < size && board[r][c + 1]) {
          total -= Math.abs(log2(value) - log2(board[r][c + 1]));
        }
        if (r + 1 < size && board[r + 1][c]) {
          total -= Math.abs(log2(value) - log2(board[r + 1][c]));
        }
      }
    }
    return total;
  }

  /** 单调性：同一行/列尽量保持同一个递增或递减方向，返回值 ≤ 0，越接近 0 越好 */
  function monotonicity(board) {
    var size = board.length;
    var rowInc = 0, rowDec = 0, colInc = 0, colDec = 0;
    var r, c, prev, value;

    for (r = 0; r < size; r++) {
      prev = null;
      for (c = 0; c < size; c++) {
        value = log2(board[r][c]);
        if (!value) continue;
        if (prev !== null) {
          if (value > prev) rowInc -= value - prev;
          else rowDec -= prev - value;
        }
        prev = value;
      }
    }

    for (c = 0; c < size; c++) {
      prev = null;
      for (r = 0; r < size; r++) {
        value = log2(board[r][c]);
        if (!value) continue;
        if (prev !== null) {
          if (value > prev) colInc -= value - prev;
          else colDec -= prev - value;
        }
        prev = value;
      }
    }

    return Math.max(rowInc, rowDec) + Math.max(colInc, colDec);
  }

  /** 最大数待在四个角之一 → 加分 */
  function cornerBonus(board) {
    var size = board.length;
    var max = Board.maxTile(board);
    if (!max) return 0;
    var corners = [[0, 0], [0, size - 1], [size - 1, 0], [size - 1, size - 1]];
    for (var i = 0; i < corners.length; i++) {
      if (board[corners[i][0]][corners[i][1]] === max) return log2(max);
    }
    return 0;
  }

  /** 局面评估：分数越高越好 */
  function evaluate(board, weights) {
    var w = weights || DEFAULTS.weights;
    return w.empty * Math.log(emptyCount(board) + 1)
      + w.monotonic * monotonicity(board)
      + w.smooth * smoothness(board)
      + w.corner * cornerBonus(board);
  }

  /* ---------------- 搜索 ---------------- */

  function search(board, depth, isPlayer, opts) {
    if (depth <= 0) return evaluate(board, opts.weights);

    var i, j;

    if (isPlayer) {
      var best = -Infinity;
      var movable = false;
      for (i = 0; i < DIRECTIONS.length; i++) {
        var result = Board.move(board, DIRECTIONS[i]);
        if (!result.moved) continue;
        movable = true;
        var value = search(result.board, depth - 1, false, opts);
        if (value > best) best = value;
      }
      return movable ? best : evaluate(board, opts.weights);
    }

    // 机会节点：随机出一个新方块
    var cells = Board.emptyCells(board);
    if (cells.length === 0) return search(board, depth - 1, true, opts);

    var sample = cells.slice(0, opts.chanceBranchLimit);
    var total = 0;
    for (i = 0; i < sample.length; i++) {
      var r = sample[i][0];
      var c = sample[i][1];
      board[r][c] = 2;
      total += (1 - opts.spawnRate4) * search(board, depth - 1, true, opts);
      board[r][c] = 4;
      total += opts.spawnRate4 * search(board, depth - 1, true, opts);
      board[r][c] = 0;
    }
    return total / sample.length;
  }

  /**
   * 选出当前最佳走法
   * @returns {{direction: string, value: number, score: number}|null} 死局返回 null
   */
  function bestMove(board, custom) {
    var opts = options(custom);
    var work = Board.cloneBoard(board);
    var best = null;

    for (var i = 0; i < DIRECTIONS.length; i++) {
      var direction = DIRECTIONS[i];
      var result = Board.move(work, direction);
      if (!result.moved) continue;
      var value = search(result.board, opts.depth - 1, false, opts);
      if (!best || value > best.value) {
        best = { direction: direction, value: value, score: result.score };
      }
    }
    return best;
  }

  /** 界面「提示」按钮用的语义化封装 */
  function hint(board, custom) {
    return bestMove(board, custom);
  }

  /**
   * 自动托管整局（不渲染，供测试与基准使用）
   * @returns {{board: number[][], score: number, moves: number, maxTile: number}}
   */
  function autoPlay(rand, custom) {
    var opts = options(custom);
    var rng = rand || Math.random;
    var board = Board.createBoard(rng);
    var score = 0;
    var moves = 0;

    while (moves < opts.maxMoves) {
      var choice = bestMove(board, opts);
      if (!choice) break;

      var result = Board.move(board, choice.direction);
      if (!result.moved) break;

      board = result.board;
      score += result.score;
      moves += 1;

      var spawned = Board.addRandomTile(board, rng);
      if (spawned) board = spawned.board;
      if (!Board.hasMoves(board)) break;
    }

    return { board: board, score: score, moves: moves, maxTile: Board.maxTile(board) };
  }

  return {
    DIRECTIONS: DIRECTIONS,
    DEFAULTS: DEFAULTS,
    options: options,
    createRng: createRng,
    evaluate: evaluate,
    smoothness: smoothness,
    monotonicity: monotonicity,
    cornerBonus: cornerBonus,
    emptyCount: emptyCount,
    bestMove: bestMove,
    hint: hint,
    autoPlay: autoPlay
  };
});
