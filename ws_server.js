const WebSocket = require('ws');
const http = require('http');
const https = require('https');

// ===================== 配置 =====================
const PORT = process.env.PORT || 3000;
const API_SOURCES = [
    { name: 'fifa', url: 'https://api.fifa.com/wc2026/matches', enabled: false }, // 需要真实API key
    { name: 'mock', url: null, enabled: true }  // 模拟数据源
];

// ===================== 内存数据存储 =====================
let liveData = {
    matches: {},      // 实时比赛数据
    standings: {},    // 积分榜
    scorers: [],      // 射手榜
    lastUpdate: null
};

// ===================== 模拟实时数据生成器 =====================
function generateMockData() {
    const teams = {
        'Argentina': { flag: '🇦🇷', goals: 0 },
        'France': { flag: '🇫🇷', goals: 0 },
        'Brazil': { flag: '🇧🇷', goals: 0 },
        'Spain': { flag: '🇪🇸', goals: 0 },
        'Germany': { flag: '🇩🇪', goals: 0 },
        'England': { flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', goals: 0 },
    };

    // 模拟进行中的比赛
    const liveMatches = [
        {
            id: 'm001',
            home: 'Argentina',
            away: 'Austria',
            score: { home: 2, away: 0 },
            time: 78,
            status: 'LIVE',
            events: [
                { type: 'goal', player: 'Messi', team: 'Argentina', minute: 23 },
                { type: 'goal', player: 'Alvarez', team: 'Argentina', minute: 65 },
                { type: 'yellow', player: 'Alaba', team: 'Austria', minute: 45 }
            ]
        },
        {
            id: 'm002',
            home: 'France',
            away: 'Iraq',
            score: { home: 1, away: 0 },
            time: 34,
            status: 'LIVE',
            events: [
                { type: 'goal', player: 'Mbappe', team: 'France', minute: 12 }
            ]
        }
    ];

    return { liveMatches, teams };
}

// ===================== 数据更新引擎 =====================
function updateLiveData() {
    const mock = generateMockData();

    // 模拟比赛进程（随机进球）
    mock.liveMatches.forEach(match => {
        if (match.status === 'LIVE' && match.time < 90) {
            match.time += 1;

            // 随机事件触发 (每轮更新 5% 概率)
            if (Math.random() < 0.05) {
                const isHomeGoal = Math.random() > 0.4;
                const team = isHomeGoal ? match.home : match.away;
                const players = {
                    'Argentina': ['Messi', 'Alvarez', 'Lautaro'],
                    'France': ['Mbappe', 'Griezmann', 'Dembele'],
                    'Brazil': ['Vinicius', 'Rodrygo', 'Endrick'],
                    'Spain': ['Yamal', 'Williams', 'Morata']
                };
                const player = (players[team] || ['Player'])[Math.floor(Math.random() * 3)];

                match.score.home += isHomeGoal ? 1 : 0;
                match.score.away += isHomeGoal ? 0 : 1;
                match.events.push({
                    type: 'goal',
                    player: player,
                    team: team,
                    minute: match.time
                });

                console.log(`⚽ GOAL! ${team} - ${player} (${match.time}')`);

                // 广播给所有客户端
                broadcast({
                    type: 'goal',
                    matchId: match.id,
                    team: team,
                    player: player,
                    minute: match.time,
                    newScore: `${match.score.home}-${match.score.away}`
                });
            }

            // 比赛结束
            if (match.time >= 90) {
                match.status = 'FT';
                broadcast({
                    type: 'match_end',
                    matchId: match.id,
                    finalScore: `${match.score.home}-${match.score.away}`
                });
            }
        }
    });

    liveData.matches = mock.liveMatches;
    liveData.lastUpdate = new Date().toISOString();

    // 广播状态更新
    broadcast({
        type: 'status_update',
        data: liveData.matches,
        timestamp: liveData.lastUpdate
    });
}

// ===================== WebSocket 服务器 =====================
const wss = new WebSocket.Server({ port: PORT });
const clients = new Map(); // client -> metadata

console.log(`🚀 WebSocket Server running on ws://localhost:${PORT}`);

wss.on('connection', (ws, req) => {
    const clientId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    const clientInfo = {
        id: clientId,
        ip: req.socket.remoteAddress,
        connectedAt: new Date(),
        subscribed: ['all']
    };
    clients.set(ws, clientInfo);

    console.log(`✅ Client connected: ${clientId} (Total: ${clients.size})`);

    // 发送欢迎消息和当前数据
    ws.send(JSON.stringify({
        type: 'welcome',
        clientId: clientId,
        serverTime: new Date().toISOString(),
        message: 'Connected to World Cup Live Feed'
    }));

    // 立即推送当前数据
    ws.send(JSON.stringify({
        type: 'initial_data',
        data: liveData.matches
    }));

    // 处理客户端消息
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleClientMessage(ws, data);
        } catch (e) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
        }
    });

    ws.on('close', () => {
        console.log(`❌ Client disconnected: ${clientId}`);
        clients.delete(ws);
    });

    ws.on('error', (err) => {
        console.error(`⚠️ Client error: ${clientId}`, err.message);
    });
});

// 处理客户端指令
function handleClientMessage(ws, data) {
    const client = clients.get(ws);

    switch(data.action) {
        case 'subscribe':
            client.subscribed = data.channels || ['all'];
            ws.send(JSON.stringify({ type: 'subscribed', channels: client.subscribed }));
            break;

        case 'get_match':
            const match = liveData.matches.find(m => m.id === data.matchId);
            ws.send(JSON.stringify({ type: 'match_data', data: match }));
            break;

        case 'get_standings':
            ws.send(JSON.stringify({ type: 'standings', data: liveData.standings }));
            break;

        case 'ping':
            ws.send(JSON.stringify({ type: 'pong', time: Date.now() }));
            break;

        default:
            ws.send(JSON.stringify({ type: 'error', message: 'Unknown action' }));
    }
}

// 广播消息给所有客户端
function broadcast(message) {
    const msg = JSON.stringify(message);
    let sent = 0;
    clients.forEach((info, ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(msg);
            sent++;
        }
    });
    console.log(`📢 Broadcast to ${sent} clients: ${message.type}`);
}

// 定时更新引擎 (每5秒模拟一次比赛进程)
setInterval(updateLiveData, 5000);

// 心跳检测 (每30秒)
setInterval(() => {
    broadcast({ type: 'heartbeat', time: Date.now() });
}, 30000);

// 初始数据
updateLiveData();

// HTTP 健康检查端点
const httpServer = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            clients: clients.size,
            uptime: process.uptime(),
            lastUpdate: liveData.lastUpdate
        }));
    } else if (req.url === '/api/matches') {
        res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify(liveData.matches));
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

httpServer.listen(PORT + 1, () => {
    console.log(`📡 HTTP API running on http://localhost:${PORT + 1}`);
});

console.log('🏆 World Cup 2026 Live Server Started');
console.log('Features:');
console.log('  - WebSocket: ws://localhost:' + PORT);
console.log('  - HTTP API: http://localhost:' + (PORT + 1));
console.log('  - Auto-updates every 5s');
console.log('  - Real-time goal notifications');
