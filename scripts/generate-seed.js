/**
 * 生成 matches.json 种子数据
 * 用于 GitHub Pages 静态部署时前端加载
 * 运行: node scripts/generate-seed.js
 */

const fs = require('fs');
const path = require('path');

// 12 组球队 (来自 server.js 的 WORLD_CUP_TEAMS)
const GROUPS = {
  A: ['Mexico', 'South Korea', 'South Africa', 'Czechia'],
  B: ['Canada', 'Switzerland', 'Bosnia-Herzegovina', 'Qatar'],
  C: ['Brazil', 'Morocco', 'Scotland', 'Haiti'],
  D: ['USA', 'Australia', 'Paraguay', 'Turkey'],
  E: ['Germany', 'Ivory Coast', 'Ecuador', 'Curaçao'],
  F: ['Netherlands', 'Japan', 'Sweden', 'Tunisia'],
  G: ['Belgium', 'Egypt', 'Iran', 'New Zealand'],
  H: ['Spain', 'Uruguay', 'Saudi Arabia', 'Cape Verde'],
  I: ['France', 'Senegal', 'Norway', 'Iraq'],
  J: ['Argentina', 'Austria', 'Algeria', 'Jordan'],
  K: ['Portugal', 'Colombia', 'Congo DR', 'Uzbekistan'],
  L: ['England', 'Croatia', 'Ghana', 'Panama'],
};

// 每组内对阵顺序 (循环赛 6 场)
const FIXTURES = [[0,1],[2,3],[0,2],[1,3],[0,3],[1,2]];

// 基础日期: 2026-06-11 (周四) 开幕式
const GROUP_START = new Date('2026-06-11T10:00:00Z');

function generateGroupMatches() {
  const matches = [];
  let matchIndex = 0;
  const groups = Object.keys(GROUPS);

  groups.forEach(g => {
    const teams = GROUPS[g];
    FIXTURES.forEach(([h, a], fi) => {
      const d = new Date(GROUP_START.getTime() + matchIndex * 4 * 60 * 60 * 1000);
      const id = 'seed_g' + g.toLowerCase() + '_' + fi;
      matches.push({
        id,
        stage: 'GROUP_' + g,
        group: g,
        home: teams[h],
        away: teams[a],
        utcDate: d.toISOString(),
        date: d.toISOString().substring(0, 10),
        time: d.toISOString().substring(11, 16),
        score: { home: 0, away: 0 },
        status: 'SCHEDULED',
        minute: 0,
      });
      matchIndex++;
    });
  });

  return matches;
}

// 1/16决赛种子
const LAST_16 = [
  { home:'Germany', away:'Paraguay',   utcDate:'2026-06-29T20:30:00Z' },
  { home:'France',  away:'Sweden',     utcDate:'2026-06-30T21:00:00Z' },
  { home:'South Africa', away:'Canada', utcDate:'2026-06-28T19:00:00Z', score:{home:0,away:1}, status:'FT' },
  { home:'Netherlands', away:'Morocco', utcDate:'2026-06-30T01:00:00Z' },
  { home:'Portugal', away:'Croatia',   utcDate:'2026-07-02T23:00:00Z' },
  { home:'Spain',   away:'Austria',    utcDate:'2026-07-02T19:00:00Z' },
  { home:'USA',     away:'Bosnia',     utcDate:'2026-07-02T00:00:00Z' },
  { home:'Belgium', away:'Senegal',    utcDate:'2026-07-01T20:00:00Z' },
  { home:'Brazil',  away:'Japan',      utcDate:'2026-06-29T17:00:00Z' },
  { home:'Ivory Coast', away:'Norway', utcDate:'2026-06-30T17:00:00Z' },
  { home:'Mexico',  away:'Ecuador',    utcDate:'2026-07-01T01:00:00Z' },
  { home:'England', away:'DR Congo',  utcDate:'2026-07-01T16:00:00Z' },
  { home:'Argentina', away:'Cape Verde', utcDate:'2026-07-03T22:00:00Z' },
  { home:'Australia', away:'Egypt',    utcDate:'2026-07-03T18:00:00Z' },
  { home:'Switzerland', away:'Algeria', utcDate:'2026-07-03T03:00:00Z' },
  { home:'Colombia', away:'Ghana',     utcDate:'2026-07-04T01:30:00Z' },
];

// Round name → stage, count, placeholder icon
const KO_ROUNDS = [
  { stage: 'LAST_16',        count: 16 },
  { stage: 'ROUND_16',       count: 8 },
  { stage: 'QUARTER_FINALS', count: 4 },
  { stage: 'SEMI_FINALS',    count: 2 },
  { stage: 'FINAL',          count: 1 },
  { stage: 'THIRD_PLACE',    count: 1 },
];

function generateKnockoutMatches(last16) {
  const matches = [];
  const baseDate = new Date('2026-06-28T12:00:00Z');

  // LAST_16 uses seed data
  last16.forEach((m, i) => {
    matches.push({
      id: 'seed_ko_last16_' + i,
      stage: 'LAST_16',
      home: m.home,
      away: m.away,
      utcDate: m.utcDate,
      date: m.utcDate ? m.utcDate.substring(0,10) : '',
      time: m.utcDate ? m.utcDate.substring(11,16) : '',
      score: m.score || { home: 0, away: 0 },
      status: m.status || 'SCHEDULED',
      minute: 0,
    });
  });

  // Higher rounds are TBD (empty)
  KO_ROUNDS.filter(r => r.stage !== 'LAST_16').forEach(r => {
    for (let i = 0; i < r.count; i++) {
      const d = new Date(baseDate.getTime() + (i + 1) * 24 * 60 * 60 * 1000);
      matches.push({
        id: 'seed_ko_' + r.stage.toLowerCase() + '_' + i,
        stage: r.stage,
        home: 'TBD',
        away: 'TBD',
        utcDate: d.toISOString(),
        date: d.toISOString().substring(0, 10),
        time: d.toISOString().substring(11, 16),
        score: { home: 0, away: 0 },
        status: 'SCHEDULED',
        minute: 0,
      });
    }
  });

  return matches;
}

function generate() {
  const groupMatches = generateGroupMatches();
  const knockoutMatches = generateKnockoutMatches(LAST_16);
  const allMatches = [...groupMatches, ...knockoutMatches];

  const outPath = path.join(__dirname, '..', 'matches.json');
  fs.writeFileSync(outPath, JSON.stringify(allMatches, null, 2), 'utf8');
  console.log('✅ generated: ' + outPath);
  console.log('   total matches: ' + allMatches.length);
  console.log('   group: ' + groupMatches.length + ' | knockout: ' + knockoutMatches.length);
}

generate();
