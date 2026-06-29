/**
 * fetch-matches.js — 定时从 football-data.org API 拉取赛程
 * 由 GitHub Actions 调用，更新 matches.json
 *
 * 环境变量:
 *   FOOTBALL_DATA_KEY  - football-data.org API Key (可选，无 key 则保留原数据)
 *
 * 使用方式:
 *   node scripts/fetch-matches.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const MATCHES_FILE = path.join(__dirname, '..', 'matches.json');
const API_KEY = process.env.FOOTBALL_DATA_KEY || '';
const COMPETITION_ID = 'WC'; // 2026 World Cup code on football-data.org

// 球队名称标准化映射
const TEAM_NAME_MAP = {
  'Bosnia-Herzegovina': 'Bosnia-Herzegovina',
  'Congo DR': 'Congo DR',
  'DR Congo': 'Congo DR',
  'Curaçao': 'Curaçao',
  'Korea Republic': 'South Korea',
  'Korea, Republic of': 'South Korea',
  'IR Iran': 'Iran',
  "Côte d'Ivoire": 'Ivory Coast',
  'Cape Verde Islands': 'Cape Verde',
  'USA': 'USA',
  'United States': 'USA',
  'China PR': 'China',
};

function normalizeTeamName(name) {
  if (!name) return 'TBD';
  const trimmed = name.trim();
  return TEAM_NAME_MAP[trimmed] || trimmed;
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'X-Auth-Token': API_KEY } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('JSON parse error: ' + e.message)); }
      });
    }).on('error', reject);
  });
}

// 状态映射 (football-data → 内部)
const STATUS_MAP = {
  'SCHEDULED': 'SCHEDULED',
  'TIMED': 'SCHEDULED',
  'IN_PLAY': 'LIVE',
  'PAUSED': 'HT',
  'FINISHED': 'FT',
  'SUSPENDED': 'SUSPENDED',
  'POSTPONED': 'POSTPONED',
  'CANCELLED': 'CANCELLED',
};

function parseApiMatches(apiData) {
  if (!apiData || !apiData.matches) return null;
  return apiData.matches.map(apiMatch => {
    const homeName = normalizeTeamName(apiMatch.homeTeam?.name);
    const awayName = normalizeTeamName(apiMatch.awayTeam?.name);
    const homeGoals = apiMatch.score?.fullTime?.home ?? 0;
    const awayGoals = apiMatch.score?.fullTime?.away ?? 0;

    // 阶段映射
    let stage = apiMatch.stage || 'GROUP_STAGE';
    if (stage.startsWith('GROUP_STAGE') || stage === 'GROUP') {
      stage = 'GROUP_' + (apiMatch.group || '').replace('Group ', '');
    }

    return {
      id: 'api_' + apiMatch.id,
      stage: stage,
      group: apiMatch.group ? apiMatch.group.replace('Group ', '') : null,
      home: homeName,
      away: awayName,
      utcDate: apiMatch.utcDate || null,
      date: apiMatch.utcDate ? apiMatch.utcDate.substring(0, 10) : '',
      time: apiMatch.utcDate ? apiMatch.utcDate.substring(11, 16) : '',
      score: { home: homeGoals, away: awayGoals },
      status: STATUS_MAP[apiMatch.status] || 'SCHEDULED',
      minute: apiMatch.status === 'FINISHED' ? 90 : (apiMatch.status === 'IN_PLAY' ? 45 : 0),
    };
  });
}

async function main() {
  let existing = [];
  try {
    const raw = fs.readFileSync(MATCHES_FILE, 'utf8');
    existing = JSON.parse(raw);
    console.log('[fetch] 当前文件: ' + existing.length + ' 场比赛');
  } catch(e) {
    console.log('[fetch] 无现有文件，将全新生成');
  }

  if (API_KEY) {
    console.log('[fetch] 使用 football-data.org API (competition=' + COMPETITION_ID + ')');
    try {
      const url = 'https://api.football-data.org/v4/competitions/' + COMPETITION_ID +
        '/matches?status=FINISHED,IN_PLAY,PAUSED,SCHEDULED,TIMED';
      const data = await httpsGet(url);
      const parsed = parseApiMatches(data);
      if (parsed && parsed.length > 0) {
        fs.writeFileSync(MATCHES_FILE, JSON.stringify(parsed, null, 2), 'utf8');
        console.log('[fetch] ✅ 更新完成: ' + parsed.length + ' 场比赛');
        return;
      } else {
        console.log('[fetch] ⚠️ API 返回空数据，保留现有');
      }
    } catch(e) {
      console.log('[fetch] ❌ API 请求失败: ' + e.message);
    }
  } else {
    console.log('[fetch] ⏭️ 无 API Key，跳过远程拉取');
  }

  // fallback: 已有文件则保留，无则报错
  if (existing.length > 0) {
    console.log('[fetch] 保留现有 ' + existing.length + ' 场比赛');
  } else {
    console.log('[fetch] ❌ 无现有数据且无法从 API 获取');
    process.exit(1);
  }
}

main().catch(e => {
  console.error('[fetch] 错误:', e.message);
  process.exit(1);
});
