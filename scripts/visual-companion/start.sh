#!/bin/bash

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}  Coding Agent 预览系统启动器${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}错误: 未检测到 Node.js${NC}"
    echo "请安装 Node.js 14+ 后重试"
    echo "访问: https://nodejs.org/ "
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 14 ]; then
    echo -e "${YELLOW}错误: Node.js 版本过低${NC}"
    echo "当前版本: $(node -v)"
    echo "需要版本: 14.0.0+"
    exit 1
fi

echo -e "${GREEN}✓ Node.js 版本: $(node -v)${NC}"

SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"

# 2. 切换到该目录
cd "$SCRIPT_DIR" || exit 1

echo "当前工作目录已切换为: $(pwd)"

# Install dependencies
echo ""
echo -e "${BLUE}正在安装依赖...${NC}"
echo "(依赖将安装到项目目录的 node_modules/)"
echo ""

npm install

if [ $? -ne 0 ]; then
    echo -e "${YELLOW}错误: 依赖安装失败${NC}"
    exit 1
fi

echo -e "${GREEN}✓ 依赖安装完成${NC}"

# Start server in background
echo ""
echo -e "${BLUE}正在后台启动服务...${NC}"
echo -e "${GREEN}服务将在后台运行${NC}"
echo ""

# Start in background
nohup npm start > server.log 2>&1 &
SERVER_PID=$!
disown "$SERVER_PID" 2>/dev/null

echo -e "${GREEN}✓ 服务已启动 (PID: $SERVER_PID)${NC}"
echo ""