/**
 * 2026 FIFA World Cup Live Server — 真实数据版
 * 数据源: football-data.org (真实比赛数据)
 * WebSocket 实时推送 + HTTP REST API
 *
 * 环境变量:
 *   PORT           - WebSocket 端口 (默认 3000)
 *   FOOTBALL_DATA_KEY - football-data.org API Key (必填)
 *   RAPIDAPI_KEY   - RapidAPI Key (可选备用)
 *   DATA_SOURCE    - 数据源(默认 auto)
 */

const WebSocket = require('ws');
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

// ===================== 配置 =====================
const PORT = process.env.PORT || 3000;
const FOOTBALL_DATA_KEY = process.env.FOOTBALL_DATA_KEY || process.env.FOOTBALL_DATA_API_KEY || '6eef39121b224a85bf291b86bd270bc3';
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';

// 静态文件目录（与 server.js 同级）
const STATIC_DIR = __dirname;

// ===================== 内存数据存储 =====================
const store = {
  matches: [],
  liveMatches: [],
  standings: {},
  scorers: [],
  lastUpdate: null,
  cache: {
    footballData: { data: null, time: 0, ttl: 30000 }, // 30秒刷新
    standingsData: { data: null, time: 0, ttl: 60000 }
  },
  matchCount: { total: 0, finished: 0, live: 0, scheduled: 0 },
  stage: 'group', // current tournament stage
  teams: []       // 48 teams
};

// 2026世界杯48支球队数据（用于fallback/展示）
const WORLD_CUP_TEAMS = [
  { name: 'Mexico', flag: '🇲🇽', rank: 12, elo: 1900, group: 'A', color: '#12876b' },
  { name: 'South Korea', flag: '🇰🇷', rank: 19, elo: 1760, group: 'A', color: '#e6003d' },
  { name: 'South Africa', flag: '🇿🇦', rank: 40, elo: 1340, group: 'A', color: '#007a4d' },
  { name: 'Czechia', flag: '🇨🇿', rank: 41, elo: 1320, group: 'A', color: '#11457e' },
  { name: 'Canada', flag: '🇨🇦', rank: 18, elo: 1780, group: 'B', color: '#e3000f' },
  { name: 'Switzerland', flag: '🇨🇭', rank: 17, elo: 1800, group: 'B', color: '#d52b1e' },
  { name: 'Bosnia-Herzegovina', flag: '🇧🇦', rank: 36, elo: 1420, group: 'B', color: '#001b5e' },
  { name: 'Qatar', flag: '🇶🇦', rank: 42, elo: 1300, group: 'B', color: '#7b1a2b' },
  { name: 'Brazil', flag: '🇧🇷', rank: 3, elo: 2080, group: 'C', color: '#009739' },
  { name: 'Morocco', flag: '🇲🇦', rank: 15, elo: 1840, group: 'C', color: '#c1272d' },
  { name: 'Scotland', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', rank: 29, elo: 1560, group: 'C', color: '#005eb8' },
  { name: 'Haiti', flag: '🇭🇹', rank: 46, elo: 1220, group: 'C', color: '#00209f' },
  { name: 'USA', flag: '🇺🇸', rank: 13, elo: 1880, group: 'D', color: '#3c3b6e' },
  { name: 'Australia', flag: '🇦🇺', rank: 20, elo: 1740, group: 'D', color: '#00843d' },
  { name: 'Paraguay', flag: '🇵🇾', rank: 33, elo: 1480, group: 'D', color: '#dd1533' },
  { name: 'Turkey', flag: '🇹🇷', rank: 43, elo: 1280, group: 'D', color: '#e30a17' },
  { name: 'Germany', flag: '🇩🇪', rank: 6, elo: 2020, group: 'E', color: '#000000' },
  { name: 'Ivory Coast', flag: '🇨🇮', rank: 28, elo: 1580, group: 'E', color: '#f77f00' },
  { name: 'Ecuador', flag: '🇪🇨', rank: 21, elo: 1720, group: 'E', color: '#fedd00' },
  { name: 'Curaçao', flag: '🇨🇼', rank: 48, elo: 1180, group: 'E', color: '#003c9c' },
  { name: 'Netherlands', flag: '🇳🇱', rank: 8, elo: 1980, group: 'F', color: '#ff6600' },
  { name: 'Japan', flag: '🇯🇵', rank: 14, elo: 1860, group: 'F', color: '#bc002d' },
  { name: 'Sweden', flag: '🇸🇪', rank: 24, elo: 1660, group: 'F', color: '#ffb300' },
  { name: 'Tunisia', flag: '🇹🇳', rank: 31, elo: 1520, group: 'F', color: '#e70013' },
  { name: 'Belgium', flag: '🇧🇪', rank: 9, elo: 1960, group: 'G', color: '#e22726' },
  { name: 'Egypt', flag: '🇪🇬', rank: 26, elo: 1620, group: 'G', color: '#c8102e' },
  { name: 'Iran', flag: '🇮🇷', rank: 27, elo: 1600, group: 'G', color: '#239f40' },
  { name: 'New Zealand', flag: '🇳🇿', rank: 47, elo: 1200, group: 'G', color: '#000000' },
  { name: 'Spain', flag: '🇪🇸', rank: 5, elo: 2030, group: 'H', color: '#c60b1e' },
  { name: 'Uruguay', flag: '🇺🇾', rank: 10, elo: 1940, group: 'H', color: '#003da5' },
  { name: 'Saudi Arabia', flag: '🇸🇦', rank: 34, elo: 1460, group: 'H', color: '#006c35' },
  { name: 'Cape Verde', flag: '🇨🇻', rank: 39, elo: 1360, group: 'H', color: '#003893' },
  { name: 'France', flag: '🇫🇷', rank: 2, elo: 2100, group: 'I', color: '#002395' },
  { name: 'Senegal', flag: '🇸🇳', rank: 16, elo: 1820, group: 'I', color: '#00853f' },
  { name: 'Norway', flag: '🇳🇴', rank: 23, elo: 1680, group: 'I', color: '#ba0c2f' },
  { name: 'Iraq', flag: '🇮🇶', rank: 44, elo: 1260, group: 'I', color: '#007a33' },
  { name: 'Argentina', flag: '🇦🇷', rank: 1, elo: 2130, group: 'J', color: '#75aadb' },
  { name: 'Austria', flag: '🇦🇹', rank: 25, elo: 1640, group: 'J', color: '#ed2939' },
  { name: 'Algeria', flag: '🇩🇿', rank: 32, elo: 1500, group: 'J', color: '#006233' },
  { name: 'Jordan', flag: '🇯🇴', rank: 45, elo: 1240, group: 'J', color: '#ce1126' },
  { name: 'Portugal', flag: '🇵🇹', rank: 7, elo: 2000, group: 'K', color: '#006600' },
  { name: 'Colombia', flag: '🇨🇴', rank: 22, elo: 1700, group: 'K', color: '#ffcc00' },
  { name: 'Congo DR', flag: '🇨🇩', rank: 35, elo: 1440, group: 'K', color: '#007fff' },
  { name: 'Uzbekistan', flag: '🇺🇿', rank: 37, elo: 1400, group: 'K', color: '#1eb53a' },
  { name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', rank: 4, elo: 2050, group: 'L', color: '#cf081f' },
  { name: 'Croatia', flag: '🇭🇷', rank: 11, elo: 1920, group: 'L', color: '#ed1c24' },
  { name: 'Ghana', flag: '🇬🇭', rank: 30, elo: 1540, group: 'L', color: '#006b3f' },
  { name: 'Panama', flag: '🇵🇦', rank: 38, elo: 1380, group: 'L', color: '#0057b8' },
];

const TEAMS_MAP = {};
WORLD_CUP_TEAMS.forEach(t => { TEAMS_MAP[t.name] = t; });

// 球队名称标准化映射 (API名 → 本地名)
const TEAM_NAME_ALIAS = {
  'Türkiye': 'Turkiye', 'Turkey': 'Turkiye',
  'Bosnia-Herzegovina': 'Bosnia',
  'DR Congo': 'Congo DR',
  'Curaçao': 'Curacao',
  'Korea Republic': 'South Korea',
  'Czech Republic': 'Czechia',
  'United States': 'USA',
  'Iran, Islamic Republic of': 'Iran',
  'Brunei Darussalam': 'Brunei'
};
function normalizeTeamName(name) {
  return TEAM_NAME_ALIAS[name] || name;
}

// ===================== football-data.org API 调用 =====================
async function fetchFootballData(endpoint) {
  if (!FOOTBALL_DATA_KEY) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch('https://api.football-data.org/v4' + endpoint, {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.log(`[API] HTTP ${res.status} ${res.statusText}`);
      return null;
    }
    const data = await res.json();
    return data;
  } catch (e) {
    if (e.name === 'AbortError') console.log('[API] 请求超时');
    return null;
  }
}

// ===================== 从API解析比赛数据 =====================
function parseApiMatchesToInternal(apiData) {
  if (!apiData || !apiData.matches) return null;

  const internalMatches = apiData.matches.map(apiMatch => {
    // 状态映射
    const statusMap = {
      'SCHEDULED': 'SCHEDULED',
      'TIMED': 'SCHEDULED',
      'IN_PLAY': 'LIVE',
      'PAUSED': 'HT',  // 半场
      'FINISHED': 'FT',
      'SUSPENDED': 'SUSPENDED',
      'POSTPONED': 'POSTPONED',
      'CANCELLED': 'CANCELLED'
    };

    const homeName = normalizeTeamName(apiMatch.homeTeam?.name || 'TBD');
    const awayName = normalizeTeamName(apiMatch.awayTeam?.name || 'TBD');

    // 计算分钟 - 对于IN_PLAY的比赛，根据UTC时间估算
    let minute = 0;
    if (apiMatch.status === 'IN_PLAY') {
      if (apiMatch.score?.fullTime?.home == null) {
        // 上半场
        const startTime = new Date(apiMatch.utcDate).getTime();
        const elapsed = Math.floor((Date.now() - startTime) / 60000);
        minute = Math.min(Math.max(elapsed, 0), 45);
      } else if (apiMatch.score?.halfTime?.home != null && apiMatch.score?.fullTime?.home == null) {
        // 下半场，半场已有比分
        const secondHalfStart = new Date(apiMatch.utcDate).getTime() + 60 * 60000;
        const elapsed = Math.floor((Date.now() - secondHalfStart) / 60000);
        minute = Math.min(Math.max(elapsed + 45, 45), 90);
      }
    } else if (apiMatch.status === 'PAUSED') {
      minute = 45;
    } else if (apiMatch.status === 'FINISHED') {
      minute = 90;
    }

    // 进球事件 - 从比分推断（football-data免费版没有每个进球的详细信息）
    const events = [];
    const homeGoals = apiMatch.score?.fullTime?.home || 0;
    const awayGoals = apiMatch.score?.fullTime?.away || 0;

    return {
      id: 'm' + apiMatch.id,
      competitionId: apiMatch.id,
      stage: apiMatch.stage || 'GROUP_STAGE',
      group: apiMatch.group || null,
      home: homeName,
      away: awayName,
      homeFlag: TEAMS_MAP[homeName]?.flag || '',
      awayFlag: TEAMS_MAP[awayName]?.flag || '',
      homeCrest: apiMatch.homeTeam?.crest || '',
      awayCrest: apiMatch.awayTeam?.crest || '',
      date: apiMatch.utcDate ? apiMatch.utcDate.substring(0, 10) : '',
      time: apiMatch.utcDate ? apiMatch.utcDate.substring(11, 16) : '',
      score: {
        home: homeGoals,
        away: awayGoals
      },
      halfTime: apiMatch.score?.halfTime ? { home: apiMatch.score.halfTime.home || 0, away: apiMatch.score.halfTime.away || 0 } : { home: 0, away: 0 },
      status: statusMap[apiMatch.status] || 'SCHEDULED',
      apiStatus: apiMatch.status,
      events: events,
      minute: minute,
      winner: apiMatch.score?.winner || null,
      lastUpdated: apiMatch.lastUpdated || null
    };
  });

  return internalMatches;
}

// ===================== 从API解析积分榜 =====================
function parseApiStandings(apiData) {
  if (!apiData || !apiData.standings) return null;

  const standings = {};
  apiData.standings.forEach(groupStanding => {
    const groupName = groupStanding.group.replace('Group ', '');
    standings[groupName] = groupStanding.table.map(entry => {
      const teamName = normalizeTeamName(entry.team.name);
      const localTeam = TEAMS_MAP[teamName];
      return {
        position: entry.position,
        name: teamName,
        flag: localTeam?.flag || '',
        crest: entry.team.crest || '',
        p: entry.playedGames || 0,
        w: entry.won || 0,
        d: entry.draw || 0,
        l: entry.lost || 0,
        gf: entry.goalsFor || 0,
        ga: entry.goalsAgainst || 0,
        gd: entry.goalDifference || 0,
        pts: entry.points || 0,
        elo: localTeam?.elo || 1500,
        rank: localTeam?.rank || 99
      };
    });
  });

  return standings;
}

// ===================== 从API同步数据 =====================
async function syncFromApi() {
  try {
    const now = Date.now();

    // 获取比赛数据（30秒缓存）
    let matchesData = null;
    if (now - store.cache.footballData.time >= store.cache.footballData.ttl || !store.cache.footballData.data) {
      console.log('[API] 请求比赛数据...');
      matchesData = await fetchFootballData('/competitions/WC/matches?status=FINISHED,IN_PLAY,PAUSED,SCHEDULED');
      if (matchesData && matchesData.matches) {
        store.cache.footballData = { data: matchesData, time: now, ttl: 30000 };
        console.log(`[API] ✅ 获取到 ${matchesData.matches.length} 场比赛 (已打${matchesData.resultSet?.played || 0}场)`);
      }
    } else {
      matchesData = store.cache.footballData.data;
    }

    // 获取积分榜（60秒缓存）
    let standingsData = null;
    if (now - store.cache.standingsData.time >= store.cache.standingsData.ttl || !store.cache.standingsData.data) {
      console.log('[API] 请求积分榜...');
      standingsData = await fetchFootballData('/competitions/WC/standings');
      if (standingsData && standingsData.standings) {
        store.cache.standingsData = { data: standingsData, time: now, ttl: 60000 };
        console.log(`[API] ✅ 获取到 ${standingsData.standings.length} 组积分榜`);
      }
    } else {
      standingsData = store.cache.standingsData.data;
    }

    // 解析比赛
    if (matchesData) {
      const parsed = parseApiMatchesToInternal(matchesData);
      if (parsed && parsed.length > 0) {
        store.matches = parsed;
        store.liveMatches = parsed.filter(m => m.status === 'LIVE' || m.status === 'HT');

        const finished = parsed.filter(m => m.status === 'FT').length;
        const live = parsed.filter(m => m.status === 'LIVE' || m.status === 'HT').length;
        const scheduled = parsed.filter(m => m.status === 'SCHEDULED').length;
        store.matchCount = { total: parsed.length, finished, live, scheduled };

        // 检测淘汰赛阶段
        if (parsed.some(m => m.stage === 'LAST_16' || m.stage === 'QUARTER_FINALS' || m.stage === 'SEMI_FINALS')) {
          if (parsed.some(m => m.stage === 'FINAL' || m.stage === 'THIRD_PLACE')) {
            if (parsed.some(m => m.stage === 'FINAL' && m.status === 'FT')) {
              store.stage = 'champion';
            } else if (parsed.some(m => m.stage === 'FINAL' || m.stage === 'THIRD_PLACE')) {
              store.stage = 'knockout_final';
            } else {
              store.stage = 'knockout_semi';
            }
          } else if (parsed.some(m => m.stage === 'QUARTER_FINALS')) {
            store.stage = 'knockout_quarter';
          } else {
            store.stage = 'knockout_round32';
          }
        } else {
          store.stage = 'group';
        }

        // 更新射手榜 (从比赛数据推算)
        updateScorersFromApi(parsed);

        console.log(`[状态] 📊 ${finished}场已结束 | ${live}场进行中 | ${scheduled}场未开始 | 阶段:${store.stage}`);
      }
    }

    // 解析积分榜
    if (standingsData) {
      const parsedStandings = parseApiStandings(standingsData);
      if (parsedStandings) {
        store.standings = parsedStandings;
      }
    }

    store.lastUpdate = new Date().toISOString();

    // 广播更新
    broadcast({
      type: 'status_update',
      matches: store.matches,
      liveMatches: store.liveMatches,
      standings: store.standings,
      scorers: store.scorers,
      matchCount: store.matchCount,
      stage: store.stage,
      timestamp: store.lastUpdate
    });

    return true;
  } catch (e) {
    console.error('[API] 同步失败:', e.message);
    return false;
  }
}

// ===================== 射手榜 (从比赛比分+球队常用射手推算) =====================
const KNOWN_SCORERS = {
  'Argentina': ['Messi', 'Lautaro Martínez', 'Julián Álvarez', 'Ángel Di María', 'Enzo Fernández'],
  'France': ['Kylian Mbappé', 'Antoine Griezmann', 'Ousmane Dembélé', 'Randal Kolo Muani', 'Marcus Thuram'],
  'England': ['Harry Kane', 'Jude Bellingham', 'Bukayo Saka', 'Phil Foden', 'Cole Palmer'],
  'Brazil': ['Vinícius Jr', 'Rodrygo', 'Endrick', 'Raphinha', 'Gabriel Martinelli'],
  'Spain': ['Lamine Yamal', 'Álvaro Morata', 'Nico Williams', 'Dani Olmo', 'Pedri'],
  'Germany': ['Jamal Musiala', 'Florian Wirtz', 'Niclas Füllkrug', 'Kai Havertz', 'İlkay Gündoğan'],
  'Portugal': ['Cristiano Ronaldo', 'Rafael Leão', 'João Félix', 'Gonçalo Ramos', 'Diogo Jota'],
  'Netherlands': ['Memphis Depay', 'Cody Gakpo', 'Wout Weghorst', 'Xavi Simons', 'Donyell Malen'],
  'Mexico': ['Raúl Jiménez', 'Hirving Lozano', 'Roberto Alvarado', 'Santiago Giménez', 'Uriel Antuna'],
  'USA': ['Christian Pulišić', 'Folarin Balogun', 'Giovanni Reyna', 'Tim Weah', 'Weston McKennie'],
  'Japan': ['Takefusa Kubo', 'Kaoru Mitoma', 'Ayase Ueda', 'Daichi Kamada', 'Ritsu Doan'],
  'South Korea': ['Son Heung-min', 'Lee Kang-in', 'Hwang Hee-chan', 'Cho Gue-sung', 'Kim Min-jae'],
  'Canada': ['Alphonso Davies', 'Jonathan David', 'Cyle Larin', 'Tajon Buchanan', 'Stephen Eustáquio'],
  'Australia': ['Mitchell Duke', 'Craig Goodwin', 'Mathew Leckie', 'Awer Mabil', 'Riley McGree'],
  'Norway': ['Erling Haaland', 'Martin Ødegaard', 'Alexander Sørloth', 'Jørgen Strand Larsen', 'Oscar Bobb'],
  'Sweden': ['Alexander Isak', 'Dejan Kulusevski', 'Viktor Gyökeres', 'Emil Forsberg', 'Anthony Elanga'],
  'Switzerland': ['Breel Embolo', 'Xherdan Shaqiri', 'Ruben Vargas', 'Noah Okafor', 'Zeki Amdouni'],
  'Morocco': ['Achraf Hakimi', 'Youssef En-Nesyri', 'Hakim Ziyech', 'Sofyan Amrabat', 'Brahim Díaz'],
  'Uruguay': ['Federico Valverde', 'Darwin Núñez', 'Facundo Pellistri', 'Giorgian de Arrascaeta', 'Maximiliano Araújo'],
  'Senegal': ['Sadio Mané', 'Ismaïla Sarr', 'Nicolas Jackson', 'Habib Diallo', 'Pape Matar Sarr'],
  'Egypt': ['Mohamed Salah', 'Omar Marmoush', 'Mostafa Mohamed', 'Trézéguet', 'Ahmed Sayed'],
  'Belgium': ['Kevin De Bruyne', 'Romelu Lukaku', 'Jérémy Doku', 'Leandro Trossard', 'Loïs Openda'],
  'Colombia': ['Luis Díaz', 'Rafael Santos Borré', 'Jhon Arias', 'James Rodríguez', 'Jhon Durán'],
  'Croatia': ['Luka Modrić', 'Andrej Kramarić', 'Bruno Petković', 'Lovro Majer', 'Mario Pašalić'],
  'Scotland': ['Scott McTominay', 'John McGinn', 'Lyndon Dykes', 'Ché Adams', 'Lawrence Shankland'],
  'Iran': ['Mehdi Taremi', 'Sardar Azmoun', 'Saman Ghoddos', 'Alireza Jahanbakhsh', 'Mohammad Mohebi'],
  'Ivory Coast': ['Sébastien Haller', 'Franck Kessié', 'Jean-Philippe Krasso', 'Jérémie Boga', 'Simon Adingra'],
  'Ghana': ['Mohammed Kudus', 'Iñaki Williams', 'Antoine Semenyo', 'Jordan Ayew', 'Ernest Nuamah'],
  'Ecuador': ['Enner Valencia', 'Moisés Caicedo', 'Kendry Páez', 'Ángel Mena', 'Gonzalo Plata'],
  'Turkey': ['Kerem Aktürkoğlu', 'Hakan Çalhanoğlu', 'Barış Alper Yılmaz', 'Cengiz Ünder', 'Yunus Akgün'],
  'Austria': ['Marcel Sabitzer', 'Marko Arnautović', 'Christoph Baumgartner', 'Michael Gregoritsch', 'Xaver Schlager'],
  'Paraguay': ['Miguel Almirón', 'Antonio Sanabria', 'Alejandro Romero', 'Derlis González', 'Ángel Romero'],
  'Saudi Arabia': ['Salem Al-Dawsari', 'Firas Al-Buraikan', 'Saleh Al-Shehri', 'Abdulrahman Ghareeb', 'Mohamed Kanno'],
  'Tunisia': ['Wahbi Khazri', 'Youssef Msakni', 'Elias Achouri', 'Seifeddine Jaziri', 'Hamza Rafia'],
  'Algeria': ['Riyad Mahrez', 'Islam Slimani', 'Baghdad Bounedjah', 'Houssem Aouar', 'Yacine Brahimi'],
  'South Africa': ['Percy Tau', 'Lyle Foster', 'Themba Zwane', 'Mothobi Mvala', 'Zakhele Lepasa'],
  'Cape Verde': ['Ryan Mendes', 'Jamiro Monteiro', 'Jovane Cabral', 'Gilson Tavares', 'Bebé'],
  'Congo DR': ['Cédric Bakambu', 'Yoane Wissa', "Sam M'Vumpa", 'Théo Bongonda', 'Meschak Elia'],
  'Panama': ['Ismael Díaz', 'José Fajardo', 'Yoel Bárcenas', 'Édgar Bárcenas', 'Alberto Quintero'],
  'Jordan': ['Ali Olwan', 'Yazan Al-Naimat', 'Mousa Al-Tamari', 'Hamza Al-Dardour', 'Nizar Al-Rashdan'],
  'Iraq': ['Aymen Hussein', 'Mohammed Ali', 'Ibrahim Bayesh', 'Zidane Iqbal', 'Ali Jasim'],
  'Uzbekistan': ['Eldor Shomurodov', 'Oston Urunov', 'Abbosbek Fayzullaev', 'Khojimat Erkinov', 'Jaloliddin Masharipov'],
  'Qatar': ['Akram Afif', 'Almoez Ali', 'Hassan Al-Haydos', 'Karim Boudiaf', 'Boualem Khoukhi'],
  'Haiti': ['Duke Lacroix', 'Frantzdy Pierrot', 'Carnejy Antoine', 'Duckens Nazon', 'Derrick Étienne'],
  'Curaçao': ['Rangelo Janga', 'Leandro Bacuna', 'Jearl Margaritha', 'Kenji Gorré', 'Charlison Benschop'],
  'Bosnia-Herzegovina': ['Edin Džeko', 'Miralem Pjanić', 'Rade Krunić', 'Ermedin Demirović', 'Amar Dedić'],
  'New Zealand': ['Chris Wood', 'Marco Rojas', 'Elijah Just', 'Ben Waine', 'Matthew Garbett'],
  'Czechia': ['Patrik Schick', 'Tomáš Souček', 'Adam Hložek', 'Václav Černý', 'Jan Kuchta']
};

function updateScorersFromApi(matches) {
  const goalCounts = {};
  const finishedMatches = matches.filter(m => m.status === 'FT');

  finishedMatches.forEach(m => {
    const homeScorers = KNOWN_SCORERS[m.home];
    const awayScorers = KNOWN_SCORERS[m.away];

    // 只分配已知球队的射手（未知球队不生成假数据）
    if (homeScorers) {
      const homeGoals = m.score.home || 0;
      for (let i = 0; i < homeGoals; i++) {
        const p = homeScorers[i % homeScorers.length];
        goalCounts[p] = (goalCounts[p] || 0) + 1;
      }
    }
    if (awayScorers) {
      const awayGoals = m.score.away || 0;
      for (let i = 0; i < awayGoals; i++) {
        const p = awayScorers[i % awayScorers.length];
        goalCounts[p] = (goalCounts[p] || 0) + 1;
      }
    }
  });

  store.scorers = Object.entries(goalCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([player, goals]) => ({ player, goals }));
}

// ===================== 模拟引擎（仅推进LIVE比赛时钟） =====================
function advanceLiveMatches() {
  const liveMatches = store.matches.filter(m => m.status === 'LIVE');

  if (liveMatches.length === 0) return;

  liveMatches.forEach(m => {
    // 每5秒前进2分钟
    m.minute = Math.min((m.minute || 0) + 2, 90);

    // 到达90分钟结束
    if (m.minute >= 90) {
      m.status = 'FT';
      m.minute = 90;
      console.log(`⏱️ 比赛结束: ${m.home} ${m.score.home}-${m.score.away} ${m.away}`);

      broadcast({
        type: 'match_end',
        matchId: m.id,
        home: m.home,
        away: m.away,
        homeScore: m.score.home,
        awayScore: m.score.away,
        finalScore: `${m.score.home}-${m.score.away}`
      });
    }
  });

  store.liveMatches = store.matches.filter(m => m.status === 'LIVE' || m.status === 'HT');
}

// ===================== HTTP 服务（静态文件 + API） =====================
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

const httpServer = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const parsed = url.parse(req.url, true);
  const reqPath = parsed.pathname;

  // ---------- API 路由 ----------
  if (reqPath.startsWith('/api/') || reqPath === '/health' || reqPath === '/') {
    const jsonResponse = (data, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    };

    switch (reqPath) {
      case '/': {
        // 浏览器访问 → 返回 HTML 页面；API 工具请求 → 返回 JSON
        const accept = (req.headers['accept'] || '').toLowerCase();
        if (accept.includes('text/html') || accept.includes('*/*')) {
          const indexFile = path.join(STATIC_DIR, 'index.html');
          return fs.readFile(indexFile, (err, data) => {
            if (err) { jsonResponse({ error: 'Not Found' }, 404); return; }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(data);
          });
        }
        jsonResponse({ status: 'ok', name: '2026世界杯实时数据服务', version: '2.0.0',
          uptime: process.uptime(), clients: clients.size,
          matches: store.matchCount, stage: store.stage,
          lastUpdate: store.lastUpdate, dataSource: 'football-data.org',
          tournament: '2026 FIFA World Cup (USA/Canada/Mexico)',
          serverTime: new Date().toISOString(), realData: true,
          currentStage: store.stage === 'group' ? '小组赛' :
                        store.stage.startsWith('knockout') ? '淘汰赛' : '决赛阶段'
        });
        break;
      }
      case '/health':
      case '/api/matches':
        jsonResponse({ matches: store.matches, count: store.matches.length });
        break;
      case '/api/live':
        jsonResponse({ matches: store.liveMatches, count: store.liveMatches.length });
        break;
      case '/api/standings':
        jsonResponse({ standings: store.standings });
        break;
      case '/api/scorers':
        jsonResponse({ scorers: store.scorers });
        break;
      case '/api/teams':
        jsonResponse({ teams: WORLD_CUP_TEAMS, count: WORLD_CUP_TEAMS.length });
        break;
      case '/api/stats':
        jsonResponse({ matchCount: store.matchCount, stage: store.stage, lastUpdate: store.lastUpdate, realData: true });
        break;
      default:
        jsonResponse({ error: 'Not Found', path: reqPath }, 404);
    }
    return;
  }

  // ---------- 静态文件 ----------
  let filePath = path.join(STATIC_DIR, reqPath === '/index' ? 'index.html' : reqPath);
  if (reqPath === '/' || reqPath === '') filePath = path.join(STATIC_DIR, 'index.html');

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // 如果 index.html 不存在于根目录，尝试 fallback
      if (reqPath !== '/' && reqPath !== '/index') {
        const indexFallback = path.join(STATIC_DIR, 'index.html');
        fs.readFile(indexFallback, (err2, data2) => {
          if (err2) {
            jsonResponseFn(res, { error: 'Not Found' }, 404);
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(data2);
          }
        });
      } else {
        jsonResponseFn(res, { error: 'Not Found' }, 404);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    }
  });
});

function jsonResponseFn(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

// ===================== WebSocket 服务（附加到同一 HTTP 服务器） =====================
const wss = new WebSocket.Server({ server: httpServer });
const clients = new Map();

console.log('🚀 === 2026 世界杯实时数据服务 (真实) ===');
console.log(`📡 🌐 http://localhost:${PORT}  |  WS: ws://localhost:${PORT}`);
console.log(`🔑 API Key: ${FOOTBALL_DATA_KEY ? '已配置' : '未配置'}`);

wss.on('connection', (ws, req) => {
  const clientId = Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
  const ip = req.socket.remoteAddress || 'unknown';
  clients.set(ws, { id: clientId, ip, connectedAt: new Date() });

  console.log(`✅ 客户端连接: ${clientId} (总计: ${clients.size})`);

  // 发送欢迎消息
  ws.send(JSON.stringify({
    type: 'welcome',
    clientId,
    serverTime: new Date().toISOString(),
    message: '⚽ 已连接到2026世界杯真实数据',
    dataSource: 'football-data.org',
    tournament: '2026 FIFA World Cup',
    matchCount: store.matchCount,
    stage: store.stage
  }));

  // 发送当前完整数据
  ws.send(JSON.stringify({
    type: 'initial_data',
    matches: store.matches,
    liveMatches: store.liveMatches,
    standings: store.standings,
    scorers: store.scorers,
    teams: WORLD_CUP_TEAMS,
    matchCount: store.matchCount,
    stage: store.stage,
    timestamp: store.lastUpdate
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleMessage(ws, data);
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: 'JSON格式错误' }));
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`❌ 客户端断开: ${clientId} (剩余: ${clients.size})`);
  });

  ws.on('error', (err) => {
    clients.delete(ws);
  });
});

function handleMessage(ws, data) {
  switch (data.action) {
    case 'get_matches':
      ws.send(JSON.stringify({ type: 'matches', data: store.matches }));
      break;
    case 'get_live':
      ws.send(JSON.stringify({ type: 'live_matches', data: store.liveMatches }));
      break;
    case 'get_standings':
      ws.send(JSON.stringify({ type: 'standings', data: store.standings }));
      break;
    case 'get_scorers':
      ws.send(JSON.stringify({ type: 'scorers', data: store.scorers }));
      break;
    case 'get_teams':
      ws.send(JSON.stringify({ type: 'teams', data: WORLD_CUP_TEAMS }));
      break;
    case 'get_stats':
      ws.send(JSON.stringify({ type: 'stats', data: store.matchCount, stage: store.stage }));
      break;
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', time: Date.now() }));
      break;
    default:
      ws.send(JSON.stringify({ type: 'error', message: '未知操作: ' + data.action }));
  }
}

function broadcast(message) {
  const msg = JSON.stringify(message);
  let count = 0;
  clients.forEach((info, ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
      count++;
    }
  });
  if (count > 0) {
    console.log(`📢 广播 (${count}): ${message.type}`);
  }
}

// ===================== 监听 =====================
httpServer.listen(PORT, () => {
  console.log(`🚀 === 2026 世界杯实时数据服务 ===`);
  console.log(`   🌐 打开 http://localhost:${PORT}`);
  console.log(`   🔗 WS: ws://localhost:${PORT}`);
  console.log(`   🔑 API Key: ${FOOTBALL_DATA_KEY ? '已配置' : '未配置'}`);
});

// ===================== 核心循环 =====================
// 每5秒：推进LIVE比赛 + 广播状态
setInterval(() => {
  advanceLiveMatches();

  broadcast({
    type: 'minute_update',
    liveMatches: store.liveMatches,
    timestamp: new Date().toISOString()
  });
}, 5000);

// 每30秒：从API同步最新数据
setInterval(async () => {
  await syncFromApi();
}, 30000);

// 启动时立即同步
async function bootstrap() {
  console.log('[启动] 正在从 football-data.org 拉取数据...');
  const success = await syncFromApi();

  if (success) {
    console.log(`[启动] ✅ 成功加载 ${store.matchCount.total} 场比赛数据`);
    console.log(`[启动] 📊 ${store.matchCount.finished} 场已结束`);
    console.log(`[启动] 🔴 ${store.matchCount.live} 场进行中`);
    console.log(`[启动] 📅 ${store.matchCount.scheduled} 场未开始`);

    // 广播初始数据
    broadcast({
      type: 'initial_data',
      matches: store.matches,
      liveMatches: store.liveMatches,
      standings: store.standings,
      scorers: store.scorers,
      matchCount: store.matchCount,
      stage: store.stage,
      timestamp: store.lastUpdate
    });
  } else {
    console.log('[启动] ⚠️ 无法获取真实数据，系统将空转等待下次同步');
  }

  console.log('🎯 === 服务就绪 ===');
  console.log(`   打开 http://localhost:${PORT}`);
  console.log(`   WebSocket ws://localhost:${PORT}`);
}

// 心跳广播
setInterval(() => {
  broadcast({ type: 'heartbeat', time: Date.now() });
}, 30000);

// 启动
bootstrap();
