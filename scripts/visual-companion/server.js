const express = require('express');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');
const WebSocket = require('ws');
const http = require('http');

const PORT = 6239;
const IDLE_TIMEOUT = 30 * 60 * 1000; // 30分钟
const app = express();

// 静态文件服务
app.use('/options', express.static(path.join(__dirname, 'options')));

// 主页面
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'template.html'));
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// WebSocket连接管理
const clients = new Set();
let lastActivity = Date.now();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('✓ 客户端已连接');

  ws.on('close', () => {
    clients.delete(ws);
    console.log('✗ 客户端断开连接');
  });
});

// 广播刷新消息
function broadcastRefresh(option) {
  const message = JSON.stringify({ type: 'refresh', option });
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
  lastActivity = Date.now();
  console.log(`⟳ 已通知刷新选项: ${option}`);
}

// 监听整个 options 目录
const watcher = chokidar.watch('options', {
  cwd: __dirname,
  ignoreInitial: true,
  persistent: true,
  depth: 2,
  awaitWriteFinish: {
    stabilityThreshold: 300,
    pollInterval: 100
  }
});

// 统一处理函数
function handleFileEvent(eventType, filePath) {
  const match = filePath.match(/options\/([ABC])\/index\.html/);
  if (!match) return;

  const option = match[1];
  console.log(`[${eventType}] ${filePath}`);
  broadcastRefresh(option);
}

// 监听所有相关事件
watcher
  .on('add', path => handleFileEvent('add', path))      // 新增文件
  .on('change', path => handleFileEvent('change', path)) // 修改文件
  .on('unlink', path => handleFileEvent('delete', path));  // 删除通知

// 空闲检测
setInterval(() => {
  const idle = Date.now() - lastActivity;
  if (idle > IDLE_TIMEOUT && clients.size === 0) {
    console.log('\n⚠ 超过30分钟无活动，自动关闭服务...');
    process.exit(0);
  }
}, 60000);

// 端口占用检测 - 关闭旧实例
const checkPort = () => {
  return new Promise((resolve) => {
    const tester = http.createServer();
    tester.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        // 端口被占用，尝试关闭旧实例
        console.log('检测到端口被占用，尝试关闭旧实例...');
        const options = {
          hostname: 'localhost',
          port: PORT,
          path: '/shutdown',
          method: 'GET',
          timeout: 2000
        };

        const req = http.request(options, (res) => {
          console.log('已发送关闭信号给旧实例');
          setTimeout(resolve, 1000);
        });

        req.on('error', () => {
          console.log('无法连接旧实例，强制启动...');
          resolve();
        });

        req.end();
      } else {
        resolve();
      }
    });

    tester.once('listening', () => {
      tester.close();
      resolve();
    });

    tester.listen(PORT);
  });
};

// 优雅关闭
function gracefulShutdown() {
  console.log('\n正在关闭服务...');

  // 强制退出定时器（5秒后）
  const forceExit = setTimeout(() => {
    console.log('强制退出...');
    process.exit(1);
  }, 5000);

  // 关闭文件监听器
  watcher.close().then(() => {
    console.log('✓ 文件监听器已关闭');

    // 关闭所有 WebSocket 连接
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.terminate();
      }
    });

    // 关闭 WebSocket 服务器
    wss.close(() => {
      console.log('✓ WebSocket 服务器已关闭');

      // 关闭 HTTP 服务器
      server.close(() => {
        console.log('✓ 服务已关闭');
        clearTimeout(forceExit);
        process.exit(0);
      });
    });
  }).catch(err => {
    console.error('关闭出错:', err);
    clearTimeout(forceExit);
    process.exit(1);
  });
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// 特殊路由：关闭旧实例
app.get('/shutdown', (req, res) => {
  res.send('正在关闭...');
  gracefulShutdown();
});

// 启动服务
checkPort().then(() => {
  server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════╗
║   Coding Agent 预览系统已启动         ║
╠═══════════════════════════════════════╣
║  🌐 访问地址: http://localhost:${PORT}   ║
║  📁 选项目录: ./options/{A,B,C}/      ║
║  🔄 实时刷新: 修改HTML自动更新         ║
║  ⏰ 自动关闭: 30分钟空闲无连接         ║
╚═══════════════════════════════════════╝

使用说明:
1. 编辑 options/A/index.html 等文件
2. 浏览器自动刷新对应选项
3. Ctrl+C 手动关闭服务
    `);
  });
});