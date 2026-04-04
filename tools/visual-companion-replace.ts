import { tool } from "@opencode-ai/plugin"
import path from "path"
import fs from "fs/promises"

// 允许的选项
const VALID_OPTIONS = ["A", "B", "C"] as const
type ValidOption = typeof VALID_OPTIONS[number]

export default tool({
  description: "Replace or create index.html in .opencode/scripts/visual-companion/options/{A|B|C}/ directory with provided content",
  args: {
    option: tool.schema.string().describe("Target option directory: {\"A\", \"B\", \"C\"}"),
    content: tool.schema.string().describe("HTML content to write to index.html"),
  },
  async execute(args, context) {
    // 验证 option 参数
    const upperOption = args.option.toUpperCase() as ValidOption
    if (!VALID_OPTIONS.includes(upperOption)) {
      const error = `Invalid option: "${args.option}". Must be one of: ${VALID_OPTIONS.join(", ")}`
      throw new Error(error)
    }

    // 构建目标目录路径: .opencode/scripts/visual-companion/options/{A|B|C}/
    const targetDir = path.join(
      context.directory,
      ".opencode/scripts/visual-companion/options",
      upperOption
    )

    // 确保目标目录存在（如果不存在则创建）
    try {
      await fs.access(targetDir)
    } catch {
      await fs.mkdir(targetDir, { recursive: true })
    }

    // 构建目标文件路径
    const targetPath = path.join(targetDir, "index.html")

    // 检查文件是否存在（用于返回信息）
    let action: "replaced" | "created"
    try {
      await fs.access(targetPath)
      action = "replaced"
    } catch {
      action = "created"
    }

    // 写入文件（替换或新建）
    await fs.writeFile(targetPath, args.content, "utf-8")

    const result = `Successfully ${action} index.html in option "${upperOption}" directory at ${targetPath}`

    return result
  },
})