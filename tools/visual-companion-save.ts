import { tool } from "@opencode-ai/plugin"
import path from "path"
import fs from "fs/promises"

// 允许的选项
const VALID_OPTIONS = ["A", "B", "C"] as const
type ValidOption = typeof VALID_OPTIONS[number]

export default tool({
  description: "Copy option file from .opencode/scripts/visual-companion/options/{A|B|C}/index.html to front-end-design/",
  args: {
    option: tool.schema.string().describe("Option source directory: {\"A\", \"B\", \"C\"}"),
    file_name: tool.schema.string().describe("Destination file name in `front-end-design/`"),
  },
  async execute(args, context) {
    // 验证 option 参数
    const upperOption = args.option.toUpperCase() as ValidOption
    if (!VALID_OPTIONS.includes(upperOption)) {
      const error = `Invalid option: "${args.option}". Must be one of: ${VALID_OPTIONS.join(", ")}`
      throw new Error(error)
    }

    // 处理文件名：如果没有后缀，自动添加 .html
    let fileName = args.file_name
    if (!path.extname(fileName)) {
      fileName = `${fileName}.html`
    }

    // 构建源文件路径: .opencode/scripts/visual-companion/options/{A|B|C}/index.html
    const sourcePath = path.join(
      context.directory,
      ".opencode/scripts/visual-companion/options",
      upperOption,
      "index.html"
    )

    // 验证源文件是否存在
    try {
      await fs.access(sourcePath)
    } catch {
      const error = `Source file not found: ${sourcePath}`
      throw new Error(error)
    }

    // 构建目标目录路径
    const destDir = path.join(context.directory, "front-end-design")

    // 确保目标目录存在
    try {
      await fs.access(destDir)
    } catch {
      await fs.mkdir(destDir, { recursive: true })
    }

    // 构建目标文件路径
    const destPath = path.join(destDir, args.file_name)

    // 执行复制
    await fs.copyFile(sourcePath, destPath)

    const result = `Successfully copied option "${upperOption}" to ${destPath}`

    return result
  },
})