安装教程：
```bash
# 在项目根目录下新建文件夹（Opencode 的配置目录）
mkdir .opencode

cd .opencode

# 拉取 repo（后面有个`.`，代表在当前目录拉取，不新建一个文件夹）
git cloe git@github.com:AI-SOIL-Lab/EveryCode.git .

# 回到项目根目录，打开 opencode 按 tab 能看到不同的 Agent 说明就可以了
cd ..
opencode
```

使用教程：
- 先使用 `prd-manager` 沟通需求，确认产出 PRD 文档之后
- 使用 `code-orchestrator`，直接说开始开发就行（后续产品形态可能就是一个按钮，点击之后发送一个默认 Prompt）