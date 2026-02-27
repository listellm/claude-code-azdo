import { exec } from "child_process";
import { promisify } from "util";
import { unlink, writeFile, stat } from "fs/promises";
import { createWriteStream } from "fs";
import { spawn } from "child_process";
import * as os from "os";
import * as path from "path";

const execAsync = promisify(exec);

const BASE_ARGS = ["-p", "--verbose", "--output-format", "stream-json"];

export type ClaudeOptions = {
  allowedTools?: string;
  disallowedTools?: string;
  maxTurns?: string;
  mcpConfig?: string;
  systemPrompt?: string;
  appendSystemPrompt?: string;
  claudeEnv?: string;
  fallbackModel?: string;
  timeoutMinutes?: string;
};

type PreparedConfig = {
  claudeArgs: string[];
  promptPath: string;
  env: Record<string, string>;
};

export type RunResult = {
  conclusion: "success" | "failure";
  executionFile: string | null;
  exitCode: number;
};

/** Options passed by the runtime environment (not user-facing task inputs). */
export type RuntimeOptions = {
  /** Additional env vars merged on top of claudeEnv — used for provider credentials. */
  extraEnv?: Record<string, string>;
  /**
   * Override the temp directory used for the named pipe and execution output file.
   * Defaults to os.tmpdir(). Azure adapter passes Agent.TempDirectory.
   */
  tmpDir?: string;
};

export function parseCustomEnvVars(claudeEnv?: string): Record<string, string> {
  if (!claudeEnv || claudeEnv.trim() === "") {
    return {};
  }

  const customEnv: Record<string, string> = {};

  for (const line of claudeEnv.split("\n")) {
    const trimmedLine = line.trim();
    if (trimmedLine === "" || trimmedLine.startsWith("#")) {
      continue;
    }

    const colonIndex = trimmedLine.indexOf(":");
    if (colonIndex === -1) {
      continue;
    }

    const key = trimmedLine.substring(0, colonIndex).trim();
    const value = trimmedLine.substring(colonIndex + 1).trim();

    if (key) {
      customEnv[key] = value;
    }
  }

  return customEnv;
}

export function prepareRunConfig(
  promptPath: string,
  options: ClaudeOptions,
): PreparedConfig {
  const claudeArgs = [...BASE_ARGS];

  if (options.allowedTools) {
    claudeArgs.push("--allowedTools", options.allowedTools);
  }
  if (options.disallowedTools) {
    claudeArgs.push("--disallowedTools", options.disallowedTools);
  }
  if (options.maxTurns) {
    const maxTurnsNum = parseInt(options.maxTurns, 10);
    if (isNaN(maxTurnsNum) || maxTurnsNum <= 0) {
      throw new Error(
        `maxTurns must be a positive number, got: ${options.maxTurns}`,
      );
    }
    claudeArgs.push("--max-turns", options.maxTurns);
  }
  if (options.mcpConfig) {
    claudeArgs.push("--mcp-config", options.mcpConfig);
  }
  if (options.systemPrompt) {
    claudeArgs.push("--system-prompt", options.systemPrompt);
  }
  if (options.appendSystemPrompt) {
    claudeArgs.push("--append-system-prompt", options.appendSystemPrompt);
  }
  if (options.fallbackModel) {
    claudeArgs.push("--fallback-model", options.fallbackModel);
  }
  if (options.timeoutMinutes) {
    const timeoutMinutesNum = parseInt(options.timeoutMinutes, 10);
    if (isNaN(timeoutMinutesNum) || timeoutMinutesNum <= 0) {
      throw new Error(
        `timeoutMinutes must be a positive number, got: ${options.timeoutMinutes}`,
      );
    }
  }

  const customEnv = parseCustomEnvVars(options.claudeEnv);

  return {
    claudeArgs,
    promptPath,
    env: customEnv,
  };
}

export async function runClaude(
  promptPath: string,
  options: ClaudeOptions,
  runtime: RuntimeOptions = {},
): Promise<RunResult> {
  const config = prepareRunConfig(promptPath, options);
  const tmpDir = runtime.tmpDir ?? os.tmpdir();
  const pipePath = path.join(tmpDir, "claude_prompt_pipe");
  const executionFile = path.join(tmpDir, "claude-execution-output.json");

  try {
    await unlink(pipePath);
  } catch {
    // Expected when pipe does not yet exist
  }

  await execAsync(`mkfifo "${pipePath}"`);

  let promptSize = "unknown";
  try {
    const stats = await stat(config.promptPath);
    promptSize = stats.size.toString();
  } catch {
    // Non-fatal — size is only for logging
  }

  console.log(`Prompt file size: ${promptSize} bytes`);

  if (Object.keys(config.env).length > 0) {
    const envKeys = Object.keys(config.env).join(", ");
    console.log(`Custom environment variables: ${envKeys}`);
  }

  console.log(`Running Claude with prompt from file: ${config.promptPath}`);

  const catProcess = spawn("cat", [config.promptPath], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const pipeStream = createWriteStream(pipePath);
  catProcess.stdout.pipe(pipeStream);

  catProcess.on("error", (error) => {
    console.error("Error reading prompt file:", error);
    pipeStream.destroy();
  });

  const claudeProcess = spawn("claude", config.claudeArgs, {
    stdio: ["pipe", "pipe", "inherit"],
    env: {
      ...process.env,
      ...config.env,
      ...(runtime.extraEnv ?? {}),
    },
  });

  claudeProcess.on("error", (error) => {
    console.error("Error spawning Claude process:", error);
    pipeStream.destroy();
  });

  let output = "";
  claudeProcess.stdout.on("data", (data: Buffer) => {
    const text = data.toString();

    const lines = text.split("\n");
    lines.forEach((line: string, index: number) => {
      if (line.trim() === "") return;

      try {
        const parsed = JSON.parse(line) as unknown;
        const prettyJson = JSON.stringify(parsed, null, 2);
        process.stdout.write(prettyJson);
        if (index < lines.length - 1 || text.endsWith("\n")) {
          process.stdout.write("\n");
        }
      } catch {
        process.stdout.write(line);
        if (index < lines.length - 1 || text.endsWith("\n")) {
          process.stdout.write("\n");
        }
      }
    });

    output += text;
  });

  claudeProcess.stdout.on("error", (error) => {
    console.error("Error reading Claude stdout:", error);
  });

  const pipeProcess = spawn("cat", [pipePath]);
  pipeProcess.stdout.pipe(claudeProcess.stdin);

  pipeProcess.on("error", (error) => {
    console.error("Error reading from named pipe:", error);
    claudeProcess.kill("SIGTERM");
  });

  let timeoutMs = 10 * 60 * 1000;
  if (options.timeoutMinutes) {
    timeoutMs = parseInt(options.timeoutMinutes, 10) * 60 * 1000;
  }

  const exitCode = await new Promise<number>((resolve) => {
    let resolved = false;

    const timeoutId = setTimeout(() => {
      if (!resolved) {
        console.error(
          `Claude process timed out after ${timeoutMs / 1000} seconds`,
        );
        claudeProcess.kill("SIGTERM");
        setTimeout(() => {
          try {
            claudeProcess.kill("SIGKILL");
          } catch {
            // Process may already be dead
          }
        }, 5000);
        resolved = true;
        resolve(124);
      }
    }, timeoutMs);

    claudeProcess.on("close", (code) => {
      if (!resolved) {
        clearTimeout(timeoutId);
        resolved = true;
        resolve(code ?? 0);
      }
    });

    claudeProcess.on("error", (error) => {
      if (!resolved) {
        console.error("Claude process error:", error);
        clearTimeout(timeoutId);
        resolved = true;
        resolve(1);
      }
    });
  });

  try {
    catProcess.kill("SIGTERM");
  } catch {
    // Process may already be dead
  }
  try {
    pipeProcess.kill("SIGTERM");
  } catch {
    // Process may already be dead
  }

  try {
    await unlink(pipePath);
  } catch {
    // Ignore errors during cleanup
  }

  const savedExecutionFile = await saveExecutionOutput(output, executionFile);

  const conclusion: "success" | "failure" =
    exitCode === 0 ? "success" : "failure";

  if (conclusion === "success") {
    console.log("Claude execution completed successfully");
    if (savedExecutionFile) {
      console.log(`Execution file: ${savedExecutionFile}`);
    }
  } else {
    console.error("Claude execution failed");
  }

  return { conclusion, executionFile: savedExecutionFile, exitCode };
}

async function saveExecutionOutput(
  output: string,
  executionFile: string,
): Promise<string | null> {
  if (!output.trim()) {
    return null;
  }

  try {
    const entries: unknown[] = [];
    for (const line of output.trim().split("\n")) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line) as unknown);
      } catch {
        // Skip non-JSON lines (e.g. informational log output)
      }
    }
    await writeFile(executionFile, JSON.stringify(entries, null, 2));
    return executionFile;
  } catch (error: unknown) {
    console.warn(`Failed to save execution output: ${error}`);
    return null;
  }
}
