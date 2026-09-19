/**
 * 核心逻辑单元测试：覆盖滑动合并的经典边界
 * 运行：node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const Board = require('../js/board.js');

const Z = [0, 0, 0, 0];

function rows(list) {
  return list.map(function (r) { return r.slice(); });
}

/** 固定序列伪随机，让「随机出块」也能断言 */
function seededRng(seq) {
  let i = 0;
  return function () {
    const v = seq[i % seq.length];
    i += 1;
    return v;
  };
}

test('emptyBoard：生成 4×4 全零棋盘', function () {
  const b = Board.emptyBoard();
  assert.equal(b.length, 4);
  b.forEach(function (row) {
    assert.equal(row.length, 4);
    row.forEach(function (v) { assert.equal(v, 0); });
  });
});

test('slideRow：非零方块向左压缩，不计分', function () {
  const res = Board.slideRow([0, 2, 0, 4]);
  assert.deepEqual(res.row, [2, 4, 0, 0]);
  assert.equal(res.score, 0);
});

test('slideRow：相邻相同合并为一个双倍方块', function () {
  const res = Board.slideRow([2, 2, 0, 0]);
  assert.deepEqual(res.row, [4, 0, 0, 0]);
  assert.equal(res.score, 4);
});

test('slideRow 边界：[2,2,2,2] 必须合并成两对，不能连锁成 8', function () {
  const res = Board.slideRow([2, 2, 2, 2]);
  assert.deepEqual(res.row, [4, 4, 0, 0]);
  assert.equal(res.score, 8, '连锁合并会把 8 分错算成 16 分');
});

test('slideRow 边界：新合成的 4 不能与后面的 4 二次合并', function () {
  const res = Board.slideRow([2, 2, 4, 0]);
  assert.deepEqual(res.row, [4, 4, 0, 0]);
  assert.equal(res.score, 4, '本步只应发生一次 2+2 合并');
});

test('slideRow 边界：[4,4,2,2] 两次独立合并', function () {
  const res = Board.slideRow([4, 4, 2, 2]);
  assert.deepEqual(res.row, [8, 4, 0, 0]);
  assert.equal(res.score, 12);
});

test('slideRow 边界：满行四连相同', function () {
  const res = Board.slideRow([8, 8, 8, 8]);
  assert.deepEqual(res.row, [16, 16, 0, 0]);
  assert.equal(res.score, 32);
});

test('slideRow：本行无法移动时原样返回且不计分', function () {
  const res = Board.slideRow([2, 4, 8, 16]);
  assert.deepEqual(res.row, [2, 4, 8, 16]);
  assert.equal(res.score, 0);
  assert.deepEqual(res.merged, []);
});

test('slideRow：merged 给出合并落点下标，供动画定位', function () {
  assert.deepEqual(Board.slideRow([2, 2, 0, 0]).merged, [0]);
  assert.deepEqual(Board.slideRow([0, 0, 2, 2]).merged, [0]);
  assert.deepEqual(Board.slideRow([0, 2, 0, 2]).merged, [0]);
  assert.deepEqual(Board.slideRow([2, 2, 2, 2]).merged, [0, 1]);
  assert.deepEqual(Board.slideRow([2, 2, 4, 4]).merged, [0, 1]);
});

test('move：left 把方块推向左侧', function () {
  const res = Board.move(rows([[0, 0, 0, 2], Z, Z, Z]), 'left');
  assert.equal(res.board[0][0], 2);
  assert.equal(res.moved, true);
});

test('move：right 把方块推向右侧', function () {
  const res = Board.move(rows([[2, 0, 0, 0], Z, Z, Z]), 'right');
  assert.equal(res.board[0][3], 2);
  assert.equal(res.moved, true);
});

test('move：up 把方块推到顶部', function () {
  const res = Board.move(rows([Z, Z, Z, [0, 0, 2, 0]]), 'up');
  assert.equal(res.board[0][2], 2);
  assert.equal(res.moved, true);
});

test('move：down 把方块推到底部', function () {
  const res = Board.move(rows([[0, 0, 2, 0], Z, Z, Z]), 'down');
  assert.equal(res.board[3][2], 2);
  assert.equal(res.moved, true);
});

test('move：竖直方向同样遵守「一次只合并一次」', function () {
  const b = rows([[2, 0, 0, 0], [2, 0, 0, 0], [2, 0, 0, 0], [2, 0, 0, 0]]);
  const res = Board.move(b, 'up');
  assert.equal(res.board[0][0], 4);
  assert.equal(res.board[1][0], 4);
  assert.equal(res.board[2][0], 0);
  assert.equal(res.score, 8);
});

test('move：得分跨行累加', function () {
  const b = rows([[2, 2, 0, 0], [4, 4, 0, 0], Z, Z]);
  const res = Board.move(b, 'left');
  assert.equal(res.score, 4 + 8);
  assert.deepEqual(res.board[0], [4, 0, 0, 0]);
  assert.deepEqual(res.board[1], [8, 0, 0, 0]);
});

test('move：无法移动时 moved=false（界面据此不再生成新方块）', function () {
  const b = rows([[2, 4, 8, 16], [4, 8, 16, 32], [8, 16, 32, 64], [16, 32, 64, 128]]);
  const res = Board.move(b, 'left');
  assert.equal(res.moved, false);
  assert.equal(res.score, 0);
  assert.deepEqual(res.board, b);
});

test('move：纯函数——不修改传入的棋盘', function () {
  const b = rows([[2, 2, 0, 0], Z, Z, Z]);
  const snapshot = JSON.stringify(b);
  Board.move(b, 'left');
  Board.move(b, 'up');
  assert.equal(JSON.stringify(b), snapshot, 'move 不得改动入参');
});

test('move：未知方向抛错', function () {
  assert.throws(function () { Board.move(Board.emptyBoard(), 'diagonal'); }, /未知方向/);
});

test('addRandomTile：满盘返回 null', function () {
  const full = rows([[2, 4, 8, 16], [4, 8, 16, 32], [8, 16, 32, 64], [16, 32, 64, 128]]);
  assert.equal(Board.addRandomTile(full), null);
});

test('addRandomTile：固定随机序列下结果可复现', function () {
  // emptyCells 是行主序：下标 8 → 第 2 行第 0 列（调试时这里一开始被我错写成 (1,1)）
  const rng = seededRng([0.5, 0.5]);
  const res = Board.addRandomTile(Board.emptyBoard(), rng);
  assert.deepEqual(res.tile, { r: 2, c: 0, value: 2 });
});

test('spawnValue：小于 0.1 出 4，否则出 2', function () {
  assert.equal(Board.spawnValue(seededRng([0.05])), 4);
  assert.equal(Board.spawnValue(seededRng([0.99])), 2);
});

test('createBoard：开局恰好两个非零方块', function () {
  const b = Board.createBoard(seededRng([0.5, 0.5, 0.9, 0.9]));
  const count = b.flat().filter(function (v) { return v !== 0; }).length;
  assert.equal(count, 2);
  assert.equal(Board.maxTile(b) <= 4, true);
});

test('maxTile / isWin：合成 2048 判定胜利', function () {
  assert.equal(Board.maxTile(rows([[2, 4, 0, 0], [0, 2048, 0, 0], Z, Z])), 2048);
  assert.equal(Board.isWin(rows([[2, 4, 0, 0], [0, 2048, 0, 0], Z, Z])), true);
  assert.equal(Board.isWin(rows([[2, 4, 0, 0], [0, 1024, 0, 0], Z, Z])), false);
});

test('hasMoves：有空位 / 有相邻相同 → 还能继续', function () {
  assert.equal(Board.hasMoves(Board.emptyBoard()), true);
  assert.equal(Board.hasMoves(rows([[2, 2, 8, 16], [4, 8, 16, 32], [8, 16, 32, 64], [16, 32, 64, 128]])), true);
});

test('hasMoves：满盘且无相邻相同 → 无路可走', function () {
  const dead = rows([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]]);
  assert.equal(Board.hasMoves(dead), false);
});
