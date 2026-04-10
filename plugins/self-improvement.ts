/**
 * Self-Improvement 插件 - OpenCode 插件
 *
 * 功能：
 * 1. session.created 时自动加载 .learnings/ 内容到会话上下文
 * 2. session.idle 时触发 AI 自我反思，记录新的学习
 *
 * 工作原理：
 * 1. 会话创建时：读取 .learnings/ 文件，通过 prompt 注入到 AI 上下文中
 * 2. 会话空闲时：通过反思 prompt 让 AI 分析并决定是否记录新学习
 *
 * 使用方式：
 * - 将此文件放入 .opencode/plugins/self-improvement/index.ts
 * - OpenCode 会自动加载插件
 */

import { mkdirSync, existsSync, appendFileSync, readFileSync } from "fs"
import { join } from "path"
import { homedir } from "os"
import type { Plugin, PluginInput } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"

// ============================================================
// 日志功能 - 调试用
// ============================================================

/** 日志文件路径（写到用户配置目录） */
const LOG_FILE = join(homedir(), ".config", "opencode", "self-improvement.log")

/**
 * 写入日志到文件
 */
function log(level: string, message: string, data?: any): void {
  const timestamp = new Date().toISOString()
  const dataStr = data ? ` | ${JSON.stringify(data)}` : ""
  const logLine = `[${timestamp}] [${level}] ${message}${dataStr}\n`

  try {
    appendFileSync(LOG_FILE, logLine)
  } catch (e) {
    // 静默处理
  }
}

// 插件加载时立即写入日志，确认是否被加载
log("INFO", "Plugin file loaded")

// 反思会话的标题，用于识别
const REFLECTION_SESSION_TITLE = "Self-Improvement Reflection"

// ============================================================
// 常量定义 - 学习记录文件的路径
// ============================================================

/** 学习记录根目录 */
const LEARNINGS_DIR = ".learnings"
/** 学习记录主文件 */
const LEARNINGS_FILE = join(LEARNINGS_DIR, "LEARNINGS.md")
/** 错误记录文件 */
const ERRORS_FILE = join(LEARNINGS_DIR, "ERRORS.md")
/** 功能请求文件 */
const FEATURE_REQUESTS_FILE = join(LEARNINGS_DIR, "FEATURE_REQUESTS.md")

// ============================================================
// 类型定义 - 输入参数的结构
// ============================================================

/** 学习记录的输入参数 */
interface LearningInput {
  category: "correction" | "insight" | "knowledge_gap" | "best_practice"
  summary: string
  details?: string
  suggestedAction?: string
  area?: "frontend" | "backend" | "infra" | "tests" | "docs" | "config"
  priority?: "low" | "medium" | "high" | "critical"
  tags?: string[]
  relatedFiles?: string[]
}

/** 错误记录的输入参数 */
interface ErrorInput {
  summary: string
  error?: string
  context?: string
  suggestedFix?: string
  area?: "frontend" | "backend" | "infra" | "tests" | "docs" | "config"
  reproducible?: "yes" | "no" | "unknown"
  relatedFiles?: string[]
}

/** 功能请求的输入参数 */
interface FeatureRequestInput {
  requestedCapability: string
  userContext?: string
  complexity?: "simple" | "medium" | "complex"
  suggestedImplementation?: string
  area?: "frontend" | "backend" | "infra" | "tests" | "docs" | "config"
  frequency?: "first_time" | "recurring"
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 生成唯一的学习记录 ID
 * 格式：TYPE-YYYYMMDD-XXX
 */
function generateId(type: "LRN" | "ERR" | "FEAT"): string {
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "")
  const random = Math.random().toString(36).slice(2, 5).toUpperCase()
  return `${type}-${dateStr}-${random}`
}

/**
 * 确保学习记录目录和文件存在
 */
function ensureLearningsDir(directory: string): void {
  log("DEBUG", "ensureLearningsDir called", { directory })

  const dir = join(directory, LEARNINGS_DIR)
  log("DEBUG", "Checking learnings directory", { dir, exists: existsSync(dir) })

  if (!existsSync(dir)) {
    log("INFO", "Creating learnings directory", { dir })
    mkdirSync(dir, { recursive: true })
  } else {
    log("DEBUG", "Learnings directory already exists")
  }

  if (!existsSync(join(directory, LEARNINGS_FILE))) {
    log("INFO", "Creating LEARNINGS.md")
    appendFileSync(
      join(directory, LEARNINGS_FILE),
      "# Learnings\n\nCorrections, insights, and knowledge gaps captured during development.\n\n**Categories**: correction | insight | knowledge_gap | best_practice\n\n---\n"
    )
  }

  if (!existsSync(join(directory, ERRORS_FILE))) {
    log("INFO", "Creating ERRORS.md")
    appendFileSync(
      join(directory, ERRORS_FILE),
      "# Errors\n\nCommand failures and integration errors.\n\n---\n"
    )
  }

  if (!existsSync(join(directory, FEATURE_REQUESTS_FILE))) {
    log("INFO", "Creating FEATURE_REQUESTS.md")
    appendFileSync(
      join(directory, FEATURE_REQUESTS_FILE),
      "# Feature Requests\n\nCapabilities requested by the user.\n\n---\n"
    )
  }

  log("DEBUG", "ensureLearningsDir completed")
}

/**
 * 追加内容到指定文件
 */
function appendEntry(directory: string, file: string, content: string): void {
  appendFileSync(join(directory, file), content + "\n")
}

/**
 * 格式化学习记录条目
 */
function formatLearningEntry(id: string, input: LearningInput): string {
  const now = new Date().toISOString()
  const tags = input.tags?.length ? `\n- Tags: ${input.tags.join(", ")}` : ""
  const relatedFiles = input.relatedFiles?.length
    ? `\n- Related Files: ${input.relatedFiles.join(", ")}`
    : ""

  return `## [${id}] ${input.category}

**Logged**: ${now}
**Priority**: ${input.priority || "medium"}
**Status**: pending
**Area**: ${input.area || "config"}

### Summary
${input.summary}

### Details
${input.details || "N/A"}

### Suggested Action
${input.suggestedAction || "N/A"}

### Metadata
- Source: self_reflection
- Pattern-Key: ${input.category}.${id.toLowerCase()}${tags}${relatedFiles}

---
`
}

/**
 * 格式化错误记录条目
 */
function formatErrorEntry(id: string, input: ErrorInput): string {
  const now = new Date().toISOString()
  const relatedFiles = input.relatedFiles?.length
    ? `\n- Related Files: ${input.relatedFiles.join(", ")}`
    : ""

  return `## [${id}] error

**Logged**: ${now}
**Priority**: high
**Status**: pending
**Area**: ${input.area || "config"}

### Summary
${input.summary}

### Error
\`\`\`
${input.error || "N/A"}
\`\`\`

### Context
${input.context || "N/A"}

### Suggested Fix
${input.suggestedFix || "N/A"}

### Metadata
- Reproducible: ${input.reproducible || "unknown"}${relatedFiles}

---
`
}

/**
 * 格式化功能请求条目
 */
function formatFeatureRequestEntry(id: string, input: FeatureRequestInput): string {
  const now = new Date().toISOString()

  return `## [${id}] ${input.requestedCapability.slice(0, 30)}

**Logged**: ${now}
**Priority**: medium
**Status**: pending
**Area**: ${input.area || "config"}

### Requested Capability
${input.requestedCapability}

### User Context
${input.userContext || "N/A"}

### Complexity Estimate
${input.complexity || "medium"}

### Suggested Implementation
${input.suggestedImplementation || "N/A"}

### Metadata
- Frequency: ${input.frequency || "first_time"}

---
`
}

/**
 * 检查是否已存在相似的记录
 */
function checkExistingSimilar(directory: string, type: string, searchTerm: string): string | null {
  const file =
    type === "learning"
      ? join(directory, LEARNINGS_FILE)
      : type === "error"
        ? join(directory, ERRORS_FILE)
        : join(directory, FEATURE_REQUESTS_FILE)

  if (!existsSync(file)) return null

  const content = readFileSync(file, "utf-8")
  const lowerSearch = searchTerm.toLowerCase()

  const lines = content.split("\n")
  for (const line of lines) {
    if (line.startsWith("## [") && line.toLowerCase().includes(lowerSearch)) {
      const match = line.match(/## \[([^\]]+)\]/)
      if (match) return match[1]
    }
  }

  return null
}

/**
 * 读取并格式化所有学习记录，用于注入到 AI 上下文
 */
function loadAllLearnings(directory: string): string {
  const parts: string[] = []
  const learnDir = join(directory, LEARNINGS_DIR)

  // 如果目录不存在，返回空
  if (!existsSync(learnDir)) {
    return ""
  }

  // 读取所有学习记录
  if (existsSync(join(directory, LEARNINGS_FILE))) {
    const content = readFileSync(join(directory, LEARNINGS_FILE), "utf-8")
    const entries = content.split("---").filter((e) => e.trim() && !e.includes("# Learnings"))
    if (entries.length > 0) {
      parts.push("## Learnings\n" + entries.join("---\n"))
    }
  }

  // 读取所有错误记录
  if (existsSync(join(directory, ERRORS_FILE))) {
    const content = readFileSync(join(directory, ERRORS_FILE), "utf-8")
    const entries = content.split("---").filter((e) => e.trim() && !e.includes("# Errors"))
    if (entries.length > 0) {
      parts.push("## Errors\n" + entries.join("---\n"))
    }
  }

  // 读取所有功能请求
  if (existsSync(join(directory, FEATURE_REQUESTS_FILE))) {
    const content = readFileSync(join(directory, FEATURE_REQUESTS_FILE), "utf-8")
    const entries = content.split("---").filter((e) => e.trim() && !e.includes("# Feature Requests"))
    if (entries.length > 0) {
      parts.push("## Feature Requests\n" + entries.join("---\n"))
    }
  }

  return parts.join("\n---\n")
}

/**
 * 反思 prompt - session.idle 时触发
 */
const REFLECTION_PROMPT = `## Self-Improvement Reflection

分析本次对话，思考是否有值得记录为学习心得的内容。

检查以下情况：
- 是否纠正了之前的错误或误解？
- 是否发现了新的知识或洞察？
- 是否找到了更好的解决方案或最佳实践？
- 是否遇到了值得避免的错误？
- 是否请求了不存在的功能？

如果有值得记录的内容，请调用 log_learning 或 log_error 工具来记录。
如果没有，无需调用任何工具。

注意：
- 只记录真正有价值的学习，不要过度记录
- 简洁描述，不要冗长
- 如果有相关文件，记录文件路径
`

/**
 * 加载学习内容的 prompt - session.created 时触发
 */
function buildLearningsLoadPrompt(directory: string): string {
  const learnings = loadAllLearnings(directory)

  if (!learnings) {
    return ""
  }

  return `## Prior Learnings

Before you start, review these prior learnings from this project:

${learnings}

Consider these learnings when working. If you discover something that contradicts or improves upon these, update them accordingly.`
}

// ============================================================
// 插件主体
// ============================================================

export const SelfImprovementPlugin: Plugin = async (ctx: PluginInput) => {
  log("INFO", "SelfImprovementPlugin initialized", { directory: ctx.directory, hasClient: !!ctx.client })

  return {
    // --------------------------------------------------------
    // 事件处理
    // --------------------------------------------------------
    event: async ({ event }: { event: any }) => {
      const sessionId = event.properties?.sessionID
      if (!sessionId || !ctx.client) {
        log("WARN", "Missing sessionId or client", { hasSessionId: !!sessionId, hasClient: !!ctx.client })
        return
      }

      // 获取会话信息（标题）
      let sessionTitle = ""
      try {
        const sessionInfo = await ctx.client.session.get({ path: { id: sessionId } })
        sessionTitle = sessionInfo.data?.title || ""
      } catch (e) {
        // 获取失败，使用空标题
      }

      // 检查会话类型
      // 反思会话：标题包含 "Self-Improvement Reflection"
      // subagent：标题格式是 "description (@agent-name subagent)"，通过 (@ 前缀判断
      const isReflectionSession = sessionTitle.includes(REFLECTION_SESSION_TITLE)
      const isSubagent = /\(@.+\s+subagent\)$/i.test(sessionTitle) || 
                         sessionTitle.toLowerCase().includes("( subagent)")

      log("DEBUG", "Session type check", { sessionId, sessionTitle, isReflectionSession, isSubagent })

      // 会话创建时：subagent 需要注入学习用于去重，primary agent 不需要
      if (event.type === "session.created") {
        // 只有 subagent 需要注入，primary agent 和反思会话跳过
        if (!isSubagent || isReflectionSession) {
          log("DEBUG", "Skipping injection", { sessionId, sessionTitle, isSubagent, isReflectionSession })
          return
        }

        log("INFO", "session.created triggered - injecting learnings", { sessionId, sessionTitle })
        ensureLearningsDir(ctx.directory)

        const prompt = buildLearningsLoadPrompt(ctx.directory)
        log("DEBUG", "Built learnings prompt", { promptLength: prompt.length, hasContent: !!prompt })

        if (prompt) {
          try {
            await ctx.client.session.prompt({
              path: { id: sessionId },
              body: {
                noReply: true,
                parts: [{ type: "text", text: prompt }],
              },
            })
            log("INFO", "Learnings injected successfully", { sessionId })
          } catch (err) {
            log("ERROR", "Failed to inject learnings", { error: String(err) })
          }
        } else {
          log("INFO", "No learnings to inject")
        }
      }

      // 会话空闲时：subagent 触发反思，primary agent 和反思会话不触发
      if (event.type === "session.idle") {
        // 反思会话和 primary agent 跳过
        if (isReflectionSession || !isSubagent) {
          log("DEBUG", "Skipping reflection", { sessionId, sessionTitle, isReflectionSession, isSubagent })
          return
        }

        log("INFO", "session.idle triggered - starting background reflection", { sessionId, sessionTitle })

        // 获取当前会话的消息历史，用于传给反思会话
        let conversationHistory = ""
        try {
          const messagesResult = await ctx.client.session.messages({
            path: { id: sessionId }
          })
          const messages = messagesResult.data || []
          log("DEBUG", "Got session messages", { sessionId, messageCount: messages.length })

          // 提取对话历史文本
          const historyParts: string[] = []
          for (const msg of messages) {
            if (msg.parts) {
              for (const part of msg.parts) {
                if (part.type === "text" && part.text) {
                  // 区分用户消息和 AI 消息
                  const role = msg.info?.role || "unknown"
                  historyParts.push(`[${role}]: ${part.text}`)
                }
              }
            }
          }
          conversationHistory = historyParts.join("\n\n")
          log("DEBUG", "Extracted conversation history", { length: conversationHistory.length })
        } catch (e) {
          log("ERROR", "Failed to get session messages", { error: String(e) })
        }

        // 创建反思会话来执行任务
        try {
          const newSession = await ctx.client.session.create({
            body: {
              title: "Self-Improvement Reflection",
            },
          })
          const newSessionId = newSession.data?.id
          log("DEBUG", "Created reflection session", { newSessionId })

          if (newSessionId && conversationHistory) {
            // 在新会话中发送反思 prompt，包含对话历史
            const reflectionTask = `# Self-Improvement Reflection

你是 self-improvement agent。请加载并使用 self-improvement skill 来分析对话内容并记录有价值的经验。

请执行以下步骤：
1. 读取配置目录下的 skill: .opencode/skills/self-improving-agent/SKILL.md
2. 按照 skill 中的格式和分析方法，检查以下对话内容
3. 如果发现有价值的内容，使用本会话中提供的 log_learning、log_error、log_feature_request 工具记录

## 对话内容

${conversationHistory}

## 分析任务

检查对话中是否有值得记录的内容：
- 是否纠正了之前的错误或误解？
- 是否发现了新的知识或洞察？
- 是否找到了更好的解决方案？
- 是否遇到了值得避免的错误？
- 是否请求了不存在的功能？

如果有值得记录的内容，使用工具记录。如果没有，回复"无需记录"。`

            // 发送 prompt 并获取 AI 响应
            const response = await ctx.client.session.prompt({
              path: { id: newSessionId },
              body: {
                parts: [{ type: "text", text: reflectionTask }],
              },
            })

            // 记录 AI 的回复
            const aiResponse = response.data?.parts?.map((p: any) => p.text || "").join("\n") || ""
            log("INFO", "Reflection AI response", { newSessionId, response: aiResponse.slice(0, 500) })

            log("INFO", "Reflection task completed", { newSessionId })
          } else if (!conversationHistory) {
            log("WARN", "No conversation history to reflect on", { sessionId })
          }
        } catch (err) {
          log("ERROR", "Failed to start reflection", { error: String(err) })
        }
      }
    },

    // --------------------------------------------------------
    // 自定义工具
    // --------------------------------------------------------
    tool: {
      /**
       * log_learning - 记录学习、纠正、洞察或最佳实践
       */
      log_learning: tool({
        description:
          "Record a learning, correction, insight, or best practice discovered during development.",
        args: {
          category: tool.schema
            .enum(["correction", "insight", "knowledge_gap", "best_practice"])
            .describe("Type of learning"),
          summary: tool.schema.string().describe("One-line description of what was learned"),
          details: tool.schema.string().optional().describe("Full context and explanation"),
          suggestedAction: tool.schema.string().optional().describe("Specific fix or improvement"),
          area: tool.schema
            .enum(["frontend", "backend", "infra", "tests", "docs", "config"])
            .optional()
            .describe("Code area"),
          priority: tool.schema
            .enum(["low", "medium", "high", "critical"])
            .optional()
            .describe("Priority level"),
          tags: tool.schema.array(tool.schema.string()).optional().describe("Related tags"),
          relatedFiles: tool.schema
            .array(tool.schema.string())
            .optional()
            .describe("Related file paths"),
        },
        async execute(args, context) {
          const { directory } = context
          log("INFO", "log_learning called", { args, directory })

          ensureLearningsDir(directory)

          const similarId = checkExistingSimilar(directory, "learning", args.summary)
          if (similarId) {
            log("INFO", "Similar learning found, skipping", { similarId })
            return `Similar learning already exists: ${similarId}\n\nConsider linking with: **See Also**: ${similarId}`
          }

          const id = generateId("LRN")
          const entry = formatLearningEntry(id, args as LearningInput)
          appendEntry(directory, LEARNINGS_FILE, entry)
          log("INFO", "Learning recorded", { id, category: args.category, summary: args.summary })

          return `Learning recorded: ${id}\n\nSaved to ${join(directory, LEARNINGS_FILE)}`
        },
      }),

      /**
       * log_error - 记录错误或命令失败
       */
      log_error: tool({
        description:
          "Record an error or command failure for future reference and prevention.",
        args: {
          summary: tool.schema.string().describe("Brief description of what failed"),
          error: tool.schema.string().optional().describe("Error message or output"),
          context: tool.schema.string().optional().describe("What was being attempted"),
          suggestedFix: tool.schema.string().optional().describe("How this might be fixed"),
          area: tool.schema
            .enum(["frontend", "backend", "infra", "tests", "docs", "config"])
            .optional()
            .describe("Code area"),
          reproducible: tool.schema.enum(["yes", "no", "unknown"]).optional(),
          relatedFiles: tool.schema
            .array(tool.schema.string())
            .optional()
            .describe("Related file paths"),
        },
        async execute(args, context) {
          const { directory } = context
          log("INFO", "log_error called", { args, directory })

          ensureLearningsDir(directory)

          const similarId = checkExistingSimilar(directory, "error", args.summary)
          if (similarId) {
            log("INFO", "Similar error found, skipping", { similarId })
            return `Similar error already exists: ${similarId}\n\nConsider linking with: **See Also**: ${similarId}`
          }

          const id = generateId("ERR")
          const entry = formatErrorEntry(id, args as ErrorInput)
          appendEntry(directory, ERRORS_FILE, entry)
          log("INFO", "Error recorded", { id, summary: args.summary })

          return `Error recorded: ${id}\n\nSaved to ${join(directory, ERRORS_FILE)}`
        },
      }),

      /**
       * log_feature_request - 记录功能请求
       */
      log_feature_request: tool({
        description:
          "Record a requested capability or feature idea.",
        args: {
          requestedCapability: tool.schema.string().describe("What the user wanted to do"),
          userContext: tool.schema.string().optional().describe("Why they needed it"),
          complexity: tool.schema.enum(["simple", "medium", "complex"]).optional(),
          suggestedImplementation: tool.schema.string().optional(),
          area: tool.schema
            .enum(["frontend", "backend", "infra", "tests", "docs", "config"])
            .optional(),
          frequency: tool.schema.enum(["first_time", "recurring"]).optional(),
        },
        async execute(args, context) {
          const { directory } = context
          log("INFO", "log_feature_request called", { args, directory })

          ensureLearningsDir(directory)

          const id = generateId("FEAT")
          const entry = formatFeatureRequestEntry(id, args as FeatureRequestInput)
          appendEntry(directory, FEATURE_REQUESTS_FILE, entry)
          log("INFO", "Feature request recorded", { id, requestedCapability: args.requestedCapability })

          return `Feature request recorded: ${id}\n\nSaved to ${join(directory, FEATURE_REQUESTS_FILE)}`
        },
      }),
    },
  }
}

export default SelfImprovementPlugin
