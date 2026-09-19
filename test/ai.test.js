/**
 * AI 单元测试：评估函数、决策正确性、确定性，以及「托管一局」的强度基准
 * 运行：node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const Board = require('../js/board.js');
const Ai = require('../js/ai.js');

const Z = [0, 0, 0, 0];

function rows(list) {
  return list.map(function (r) { return r.slice(); });
}

test('evaluate：空格越多分数越高', function () {
  const crowded = rows([[2, 4, 8, 16], [4, 8, 16, 32], [8, 16, 32, 64], [16, 32, 64, 0]]);
  const roomy = rows([[2, 4, 8, 16], [4, 8, 16, 32], [8, 16, 32, 64], Z]);
  assert.ok(Ai.evaluate(roomy) > Ai.evaluate(crowded), '空 4 格应比空 1 格更优');
});

test('evaluate：最大数在角落时加分', function () {
  const inCorner = rows([[1024, 2, 4, 8], [2, 4, 8, 16], [0, 0, 0, 0], Z]);
  const inMiddle = rows([[2, 4, 8, 16], [4, 1024, 8, 16], [0, 0, 0, 0], Z]);
  assert.ok(Ai.evaluate(inCorner) > Ai.evaluate(inMiddle), '大数在角落应更优');
});

test('evaluate：单调排列优于交错排列', function () {
  const monotone = rows([[2, 4, 8, 16], [0, 0, 0, 0], Z, Z]);
  const messy = rows([[16, 2, 8, 4], [0, 0, 0, 0], Z, Z]);
  assert.ok(Ai.monotonicity(monotone) > Ai.monotonicity(messy));
});

test('smoothness：相邻数值平滑时惩罚更小', function () {
  const smooth = rows([[2, 4, 8, 0], Z, Z, Z]);
  const jumpy = rows([[2, 512, 4, 0], Z, Z, Z]);
  assert.ok(Ai.smoothness(smooth) > Ai.smoothness(jumpy));
});

test('bestMove：只有竖直方向可动时，必须返回竖直方向', function () {
  // 满盘 + 每行都没有相邻相同 → 左右移动必然是空操作；
  // 只有第 3 列存在上下相邻的 64，所以只有上/下能真正改变局面。
  const board = rows([
    [2, 4, 8, 16],
    [4, 8, 16, 64],
    [8, 16, 32, 64],
    [16, 32, 64, 128]
  ]);
  assert.equal(Board.move(board, 'left').moved, false, '前提校验：左移应为空操作');
  assert.equal(Board.move(board, 'right').moved, false, '前提校验：右移应为空操作');

  const choice = Ai.bestMove(board);
  assert.ok(choice, '应给出走法');
  assert.ok(['up', 'down'].includes(choice.direction), '实际给出：' + choice.direction);
});

test('bestMove：返回的走法一定合法，绝不会是空操作方向', function () {
  const samples = [
    rows([[2, 2, 0, 0], Z, Z, Z]),
    rows([[2, 4, 8, 16], [4, 8, 16, 32], Z, Z]),
    rows([[0, 0, 0, 2], [0, 0, 0, 4], [0, 0, 0, 8], Z]),
    rows([[2, 0, 2, 0], [0, 4, 0, 4], Z, Z])
  ];
  samples.forEach(function (board) {
    const choice = Ai.bestMove(board);
    assert.ok(choice, '有方块的局面必然存在走法：' + JSON.stringify(board));
    assert.equal(
      Board.move(board, choice.direction).moved,
      true,
      choice.direction + ' 是空操作，不应被选中'
    );
  });
});

test('bestMove：有直连合并机会时不选无效方向', function () {
  const board = rows([[2, 2, 0, 0], [0, 0, 0, 0], Z, Z]);
  const choice = Ai.bestMove(board);
  assert.ok(choice);
  const applied = Board.move(board, choice.direction);
  assert.ok(applied.moved, '不能选到一个无效方向');
});

test('bestMove：死局返回 null', function () {
  const dead = rows([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]]);
  assert.equal(Ai.bestMove(dead), null);
});

test('bestMove：同一棋盘决策确定（不依赖随机数）', function () {
  const board = rows([[2, 2, 4, 8], [0, 0, 0, 0], [0, 4, 0, 0], Z]);
  const first = Ai.bestMove(board);
  const second = Ai.bestMove(board);
  assert.deepEqual(first, second);
});

test('bestMove：纯函数——不修改传入棋盘', function () {
  const board = rows([[2, 2, 4, 8], [0, 0, 0, 0], [0, 4, 0, 0], Z]);
  const snapshot = JSON.stringify(board);
  Ai.bestMove(board);
  assert.equal(JSON.stringify(board), snapshot);
});

test('bestMove：hint 与 bestMove 行为一致', function () {
  const board = rows([[2, 2, 4, 8], [0, 0, 0, 0], [0, 4, 0, 0], Z]);
  assert.deepEqual(Ai.hint(board), Ai.bestMove(board));
});

test('createRng：同一种子产生同一序列', function () {
  const a = Ai.createRng(42);
  const b = Ai.createRng(42);
  const seqA = [a(), a(), a()];
  const seqB = [b(), b(), b()];
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, [Ai.createRng(43)(), Ai.createRng(43)(), Ai.createRng(43)()]);
});

test('autoPlay：托管一局能正常结束，且能合出 512 以上', function () {
  const result = Ai.autoPlay(Ai.createRng(2026), { depth: 4, chanceBranchLimit: 6 });
  assert.ok(result.moves > 20, '应该走了不少步，实际 ' + result.moves);
  assert.equal(Board.hasMoves(result.board), false, '结束后应确实无路可走');
  assert.ok(
    result.maxTile >= 512,
    'AI 强度不足：只合出 ' + result.maxTile + '（得分 ' + result.score + '，步数 ' + result.moves + '）'
  );
});

test('autoPlay：固定种子可复现（AI + 出块都确定）', function () {
  const first = Ai.autoPlay(Ai.createRng(7), { depth: 2, chanceBranchLimit: 4, maxMoves: 120 });
  const second = Ai.autoPlay(Ai.createRng(7), { depth: 2, chanceBranchLimit: 4, maxMoves: 120 });
  assert.deepEqual(first, second);
});

test('autoPlay：maxMoves 上限生效（防御性兜底）', function () {
  const result = Ai.autoPlay(Ai.createRng(1), { depth: 2, chanceBranchLimit: 2, maxMoves: 25 });
  assert.ok(result.moves <= 25, '不应超过上限，实际 ' + result.moves);
});
