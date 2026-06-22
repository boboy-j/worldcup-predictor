# 🏆 2026世界杯 · 实时赛况与预测

美加墨（美国/加拿大/墨西哥）2026年FIFA世界杯实时数据监测与AI预测工具。

## ✨ 功能

| 功能 | 说明 |
|------|------|
| 📊 **数据看板** | 48队、12组、104场比赛概览，实时积分榜，射手榜 |
| 📡 **实时直播** | WebSocket 推送实时比分、进球通知、比赛事件 |
| 🏆 **冠军预测** | 蒙特卡洛模拟（10,000次），基于ELO评分的夺冠概率 |
| ⚽ **单场预测** | ELO模型预测主胜/平局/客胜概率 |
| 🎯 **精确比分** | 泊松分布 + xG模型预测最可能比分 |
| 🏅 **淘汰赛** | 完整淘汰赛对阵图（1/16→决赛） |
| 🌓 **深色模式** | 一键切换主题（草绿/暗夜） |
| 📱 **PWA支持** | 添加到主屏幕，如同原生App |

## 🚀 一键部署到云端

### 方式一：Railway（推荐，免费）

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/new?template=https://github.com/atomgit/worldcup2026-predictor)

1. 点击上方按钮（或手动创建项目）
2. 连接你的 GitHub 仓库
3. 在 Railway 面板设置环境变量：
   - `FOOTBALL_DATA_KEY` — football-data.org API Key（可选，但有数据更真实）
4. 部署完成，Railway 会给你一个 `https://你的项目.railway.app` 的地址
5. 手机打开这个地址即可使用！

### 方式二：Render

1. 在 [render.com](https://render.com) 注册（GitHub 登录）
2. 点击 **New Web Service** → 连接 GitHub 仓库
3. 选择 Node 环境，Start Command: `node server.js`
4. 添加环境变量 `FOOTBALL_DATA_KEY`
5. 部署后获得 `https://你的项目.onrender.com` 地址

### 方式三：本地运行

```bash
# 1. 安装依赖
npm install

# 2. 配置 API Key（可选，不配也能跑但数据是模拟的）
set FOOTBALL_DATA_KEY=your_key_here

# 3. 启动服务
npm start

# 4. 浏览器打开
#    http://localhost:3000
```

## 🔑 获取真实数据

本应用使用 **football-data.org** 的免费 API：

1. 访问 https://www.football-data.org/ 注册
2. 获取你的免费 API Key
3. 在部署平台设置环境变量 `FOOTBALL_DATA_KEY`
4. 部署后自动获取 **104场真实比赛数据**

## 📱 手机使用

部署成功后，在手机上：
1. **iPhone**：Safari 打开 → 分享按钮 → "添加到主屏幕"
2. **Android**：Chrome 打开 → 菜单 → "添加到主屏幕"

之后就能像原生 App 一样一键打开。

## 🛠️ 技术栈

- **前端**: HTML5 + CSS3 + Tailwind CSS + FontAwesome + Chart.js
- **实时通信**: WebSocket (ws 库)
- **后端**: Node.js + ws + node-fetch
- **数据源**: football-data.org API
- **预测模型**: ELO评分 + 蒙特卡洛模拟 + 泊松分布
- **PWA**: Service Worker + Manifest

## License

MIT
