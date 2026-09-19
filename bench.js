/**
 * AI 强度与性能基准脚本
 * ------------------------------------------------------------------
 * 用法：node tools/bench.js [每个配置的对局数]
 * 作用：用固定随机种子跑多局托管，输出平均得分 / 最大方块 / 每步耗时，
 *       用来决定默认搜索深度与权重——调参靠数据，不靠感觉。
 */
const Board = require('../js/board.js');
const Ai = require('../js/ai.js');

const GAMES = parseInt(process.argv[2], 10) || 5;
// 说明：depth=6 每步要搜十万量级节点，单局耗时以分钟计，故不放进默认对比。
const CONFIGS = [
  { label: 'depth=2', depth: 2, chanceBranchLimit: 6 },
  { label: 'depth=3', depth: 3, chanceBranchLimit: 6 },
  { label: 'depth=4', depth: 4, chanceBranchLimit: 6 },
  { label: 'depth=5 bl=4', depth: 5, chanceBranchLimit: 4 },
  { label: 'depth=5 bl=6', depth: 5, chanceBranchLimit: 6 }
];

function average(list) {
  return list.reduce(function (a, b) { return a + b; }, 0) / list.length;
}

console.log('每个配置跑 ' + GAMES + ' 局，固定种子 1..' + GAMES + '\n');
console.log('配置'.padEnd(14) + '平均得分'.padEnd(12) + '最大方块'.padEnd(12) + '平均步数'.padEnd(12) + '每步毫秒');
console.log('-'.repeat(62));

CONFIGS.forEach(function (config) {
  const scores = [];
  const tiles = [];
  const moves = [];
  let elapsed = 0;

  for (let i = 1; i <= GAMES; i++) {
    const start = process.hrtime.bigint();
    const result = Ai.autoPlay(Ai.createRng(i), {
      depth: config.depth,
      chanceBranchLimit: config.chanceBranchLimit
    });
    elapsed += Number(process.hrtime.bigint() - start) / 1e6;
    scores.push(result.score);
    tiles.push(result.maxTile);
    moves.push(result.moves);
  }

  const totalMoves = moves.reduce(function (a, b) { return a + b; }, 0);
  console.log(
    config.label.padEnd(14) +
    String(Math.round(average(scores))).padEnd(12) +
    String(Math.round(average(tiles))).padEnd(12) +
    String(Math.round(average(moves))).padEnd(12) +
    (elapsed / totalMoves).toFixed(1)
  );
});
