import { tool } from "@opencode-ai/plugin"
import { spawn, execSync } from "child_process"
import { writeFile, mkdir, appendFile, readFile, stat, unlink } from "fs/promises"
import { homedir } from "os"
import path from "path"

const TASK_DIR = path.join(homedir(), ".opencode", "background-tasks")

interface TaskMeta {
  pid: number
  command: string
  description: string
  startTime: string
  status: string
  logFile: string
  workdir: string
}

function generateTaskId(): string {
  return `bg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

// Tool 1: Start background task
export const bash_background = tool({
  description: `Execute a bash command in the background.
Use this for long-running processes like dev servers, file watchers, or any command that would block the session.

The command runs detached from the session. Output is saved to a log file that can be retrieved with task_logs.
Returns immediately with a task_id for management.

Examples:
- Start dev server: {"command": "npm run dev", "description": "Start Vite dev server"}
- Run tests in background: {"command": "npm test", "description": "Run test suite"}
- File watcher: {"command": "npm run watch", "description": "Watch files for changes"}`,

  args: {
    command: tool.schema.string().describe("The shell command to execute"),
    description: tool.schema.string().describe("Clear description of what this command does (5-10 words)"),
    workdir: tool.schema.string().optional().describe("Working directory (defaults to current directory)"),
    capture_initial: tool.schema.boolean().optional().describe(
      "If true, waits 2 seconds and captures initial output to verify startup succeeded"
    ),
  },

  async execute(args, context) {
    const taskId = generateTaskId()
    const logFile = path.join(TASK_DIR, `${taskId}.log`)
    const metaFile = path.join(TASK_DIR, `${taskId}.json`)

    await mkdir(TASK_DIR, { recursive: true })

    const startTime = new Date().toISOString()
    await writeFile(logFile, `[${startTime}] Started: ${args.command}\n\n`)

    const child = spawn("sh", ["-c", `${args.command} 2>&1`], {
      cwd: args.workdir || context.worktree,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    })

    try {
      execSync(`ps -opid= -g ${child.pid} > /dev/null 2>&1 && setpgid ${child.pid} ${child.pid} || true`)
    } catch {}

    child.stdout.on("data", (data) => {
      appendFile(logFile, data).catch(() => {})
    })
    child.stderr.on("data", (data) => {
      appendFile(logFile, data).catch(() => {})
    })

    const meta: TaskMeta = {
      pid: child.pid!,
      command: args.command,
      description: args.description,
      workdir: args.workdir || context.worktree,
      startTime,
      logFile,
      status: "running",
    }
    await writeFile(metaFile, JSON.stringify(meta, null, 2))

    child.unref()

    let initialOutput = ""
    if (args.capture_initial) {
      await new Promise((r) => setTimeout(r, 2000))
      try {
        const logContent = await readFile(logFile, "utf-8")
        const lines = logContent.split("\n").slice(2)
        initialOutput = lines.join("\n").slice(0, 800)
        if (lines.join("\n").length > 800) {
          initialOutput += "\n... (truncated)"
        }
      } catch {}
    }

    return [
      `Background task started`,
      `Task ID: ${taskId}`,
      `PID: ${child.pid}`,
      `Log: ${logFile}`,
      ``,
      `Manage this task:`,
      `- Check status: task_status({"task_id": "${taskId}"})`,
      `- View logs: task_logs({"task_id": "${taskId}"})`,
      `- Stop: task_stop({"task_id": "${taskId}"})`,
      args.capture_initial && initialOutput ? `\n--- Initial Output ---\n${initialOutput}` : "",
    ].filter(Boolean).join("\n")
  },
})

// Tool 2: Get task logs
export const task_logs = tool({
  description: `Get the output logs of a background task started by bash_background.
Use this to check progress, view results, or debug issues.

Examples:
- View last 50 lines: {"task_id": "bg_1234567890_abcdef"}
- View last 100 lines: {"task_id": "bg_1234567890_abcdef", "lines": 100}`,

  args: {
    task_id: tool.schema.string().describe("Task ID returned by bash_background"),
    lines: tool.schema.number().optional().describe("Number of recent lines to show (default: 50, max: 500)"),
  },

  async execute(args) {
    const logFile = path.join(TASK_DIR, `${args.task_id}.log`)
    const lines = Math.min(args.lines || 50, 500)

    try {
      const content = await readFile(logFile, "utf-8")
      const allLines = content.split("\n")
      const recent = allLines.slice(-lines)

      const stats = await stat(logFile)
      const sizeKB = (stats.size / 1024).toFixed(1)

      return [
        `Task Logs: ${args.task_id}`,
        `Lines: ${allLines.length} total, showing last ${recent.length} | Size: ${sizeKB} KB`,
        ``,
        "```",
        ...recent,
        "```",
      ].join("\n")
    } catch (error) {
      return `Error reading logs for task ${args.task_id}: ${(error as Error).message}`
    }
  },
})

// Tool 3: Check task status
export const task_status = tool({
  description: `Check the status of a background task started by bash_background.
Returns whether the task is running, how long it has been running, and other metadata.

Example: {"task_id": "bg_1234567890_abcdef"}`,

  args: {
    task_id: tool.schema.string().describe("Task ID returned by bash_background"),
  },

  async execute(args) {
    const metaFile = path.join(TASK_DIR, `${args.task_id}.json`)

    try {
      const meta: TaskMeta = JSON.parse(await readFile(metaFile, "utf-8"))
      const running = isRunning(meta.pid)

      if (!running && meta.status === "running") {
        meta.status = "completed"
        await writeFile(metaFile, JSON.stringify(meta, null, 2))
      }

      const duration = Date.now() - new Date(meta.startTime).getTime()
      const hours = Math.floor(duration / 3600000)
      const mins = Math.floor((duration % 3600000) / 60000)
      const secs = Math.floor((duration % 60000) / 1000)
      const durationStr = hours > 0 ? `${hours}h ${mins}m ${secs}s` : `${mins}m ${secs}s`

      return [
        `Task Status: ${args.task_id}`,
        `Status: ${running ? "Running" : "Completed"}`,
        `Description: ${meta.description}`,
        `Command: ${meta.command}`,
        `PID: ${meta.pid}`,
        `Duration: ${durationStr}`,
        `Started: ${meta.startTime}`,
        ``,
        running
          ? `To view output: task_logs({"task_id": "${args.task_id}"})`
          : `To view final output: task_logs({"task_id": "${args.task_id}"})`,
      ].join("\n")
    } catch (error) {
      return `Task not found: ${args.task_id}`
    }
  },
})

// Tool 4: Stop task
export const task_stop = tool({
  description: `Stop a running background task started by bash_background.
Sends SIGTERM first, waits 2 seconds, then sends SIGKILL if still running.

Example: {"task_id": "bg_1234567890_abcdef"}`,

  args: {
    task_id: tool.schema.string().describe("Task ID returned by bash_background"),
  },

  async execute(args) {
    const metaFile = path.join(TASK_DIR, `${args.task_id}.json`)

    try {
      const meta: TaskMeta = JSON.parse(await readFile(metaFile, "utf-8"))

      try {
        execSync(`kill -TERM -${meta.pid} 2>/dev/null || true`)
        await new Promise((r) => setTimeout(r, 1000))
        const checkResult = execSync(`ps -opid= -g ${meta.pid} 2>/dev/null | wc -l`).toString().trim()
        if (parseInt(checkResult) > 0) {
          execSync(`kill -KILL -${meta.pid} 2>/dev/null || true`)
        }
      } catch {
      }

      await writeFile(metaFile, JSON.stringify({ ...meta, status: "stopped" }, null, 2))

      return [
        `Task stopped: ${args.task_id}`,
        `Description: ${meta.description}`,
        `PID: ${meta.pid}`,
        ``,
        `To view final output: task_logs({"task_id": "${args.task_id}"})`,
        `To clean up: delete ${metaFile}`,
      ].join("\n")
    } catch (error) {
      return `Task not found: ${args.task_id}`
    }
  },
})
