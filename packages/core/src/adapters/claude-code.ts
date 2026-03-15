/**
 * Claude Code Runtime Adapter
 *
 * Spawns Claude Code CLI (`claude`) as a subprocess to execute tasks.
 * Uses `claude --print` for non-interactive execution and parses the
 * structured output to extract results.
 *
 * Supports:
 * - Non-interactive task execution via --print flag
 * - Context file injection via --allowedTools and file reading
 * - Budget enforcement via --max-turns
 * - Git branch isolation (creates and checks out branches)
 * - Structured result parsing from Claude's output
 * - Abort via process kill
 *
 * Requirements:
 * - `claude` CLI must be installed and on PATH
 * - User must be authenticated (run `claude` once interactively first)
 */

import { spawn, execSync, type ChildProcess } from 'node:child_process';
import type { AgentConfig, Task, TaskResult, TokenUsage, Decision } from '../types.js';
import type { RuntimeAdapter, RuntimeContext, RuntimeResult } from '../runtime.js';

// ─── Configuration ──────────────────────────────────────────────────────────

export interface ClaudeCodeOptions {
  /** Path to claude CLI binary (default: 'claude' — uses PATH) */
  binaryPath?: string;
  /** Max turns per task (prevents runaway agents) */
  maxTurns?: number;
  /** Timeout per task in milliseconds (default: 10 minutes) */
  timeoutMs?: number;
  /** Additional CLI flags to pass through */
  extraFlags?: string[];
  /** Whether to use --verbose for debugging */
  verbose?: boolean;
  /** Model to use (default: claude's own default) */
  model?: string;
}

// ─── Adapter ────────────────────────────────────────────────────────────────

export class ClaudeCodeAdapter implements RuntimeAdapter {
  readonly runtime = 'claude-code';
  private options: Required<ClaudeCodeOptions>;
  private runningProcesses = new Map<string, ChildProcess>();

  constructor(options: ClaudeCodeOptions = {}) {
    this.options = {
      binaryPath: options.binaryPath || 'claude',
      maxTurns: options.maxTurns || 30,
      timeoutMs: options.timeoutMs || 10 * 60 * 1000, // 10 minutes
      extraFlags: options.extraFlags || [],
      verbose: options.verbose || false,
      model: options.model || '',
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      execSync(`${this.options.binaryPath} --version`, {
        stdio: 'pipe',
        timeout: 5000,
      });
      return true;
    } catch {
      return false;
    }
  }

  async execute(task: Task, agent: AgentConfig, context: RuntimeContext): Promise<RuntimeResult> {
    const startTime = Date.now();
    const prompt = this.buildPrompt(task, agent, context);
    const args = this.buildArgs(prompt);

    return new Promise<RuntimeResult>((resolve, reject) => {
      const proc = spawn(this.options.binaryPath, args, {
        cwd: context.workingDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          // Ensure non-interactive mode
          CI: '1',
        },
      });

      this.runningProcesses.set(task.id, proc);

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      // Timeout
      const timer = setTimeout(() => {
        proc.kill('SIGTERM');
        reject(new Error(`Claude Code timed out after ${this.options.timeoutMs}ms for task "${task.title}"`));
      }, this.options.timeoutMs);

      proc.on('close', (code: number | null) => {
        clearTimeout(timer);
        this.runningProcesses.delete(task.id);

        const durationMs = Date.now() - startTime;
        const result = this.parseResult(stdout, stderr, code, durationMs);
        resolve(result);
      });

      proc.on('error', (err: Error) => {
        clearTimeout(timer);
        this.runningProcesses.delete(task.id);
        reject(new Error(`Failed to spawn Claude Code: ${err.message}`));
      });
    });
  }

  async abort(taskId: string): Promise<void> {
    const proc = this.runningProcesses.get(taskId);
    if (proc) {
      proc.kill('SIGTERM');
      // Give it a moment, then force kill
      setTimeout(() => {
        if (!proc.killed) proc.kill('SIGKILL');
      }, 5000);
      this.runningProcesses.delete(taskId);
    }
  }

  // ─── Prompt Building ────────────────────────────────────────────────────

  private buildPrompt(task: Task, agent: AgentConfig, context: RuntimeContext): string {
    const sections: string[] = [];

    // Role and mission framing
    sections.push(`You are an AI coding agent working as part of a coordinated team managed by Jacbot.`);
    sections.push(`Project mission: ${context.mission}`);
    sections.push('');

    // Agent identity
    sections.push(`Your role: ${agent.role} (${agent.name})`);
    if (agent.instructions) {
      sections.push(`Agent instructions: ${agent.instructions}`);
    }
    sections.push('');

    // Task specification
    sections.push(`## Task: ${task.title}`);
    sections.push('');
    sections.push(task.description);
    sections.push('');

    // Goal chain — why this task exists
    if (task.goalChain.length > 0) {
      sections.push('## Goal Chain');
      task.goalChain.forEach((goal, i) => {
        sections.push(`${i + 1}. ${goal}`);
      });
      sections.push('');
    }

    // Context files to focus on
    if (task.contextFiles.length > 0) {
      sections.push('## Key Files');
      sections.push('Focus your work on these files:');
      task.contextFiles.forEach(f => sections.push(`- ${f}`));
      sections.push('');
    }

    // Memory context from previous tasks/sessions
    if (context.memoryContext) {
      sections.push('## Relevant Context from Previous Work');
      sections.push(context.memoryContext);
      sections.push('');
    }

    // Git branch
    sections.push(`## Branch`);
    sections.push(`Work on branch: \`${context.branch}\``);
    sections.push(`Create it if it doesn't exist: \`git checkout -b ${context.branch}\``);
    sections.push('');

    // Output format request
    sections.push('## Completion');
    sections.push('When you are done, output a summary in this exact format:');
    sections.push('```');
    sections.push('JACBOT_RESULT_START');
    sections.push('summary: <one line summary of what you did>');
    sections.push('exit_code: <success|partial|failed>');
    sections.push('files_changed:');
    sections.push('- <file path>');
    sections.push('decisions:');
    sections.push('- decision: <what you decided>');
    sections.push('  rationale: <why>');
    sections.push('JACBOT_RESULT_END');
    sections.push('```');

    return sections.join('\n');
  }

  // ─── Args Building ──────────────────────────────────────────────────────

  private buildArgs(prompt: string): string[] {
    const args: string[] = [
      '--print',                            // Non-interactive mode
      '--output-format', 'json',            // Structured JSON output for reliable parsing
      '--max-turns', String(this.options.maxTurns),
    ];

    if (this.options.model) {
      args.push('--model', this.options.model);
    }

    if (this.options.verbose) {
      args.push('--verbose');
    }

    // Pass through any extra flags
    args.push(...this.options.extraFlags);

    // Prompt is passed as positional argument (last)
    args.push('-p', prompt);

    return args;
  }

  // ─── Result Parsing ─────────────────────────────────────────────────────

  private parseResult(
    stdout: string,
    stderr: string,
    exitCode: number | null,
    durationMs: number,
  ): RuntimeResult {
    // Try to parse Claude Code's --output-format json response
    const jsonResult = this.parseJsonOutput(stdout);
    if (jsonResult) {
      return { ...jsonResult, durationMs };
    }

    // Fallback: try the JACBOT_RESULT_START structured block
    const structured = this.parseStructuredResult(stdout);
    if (structured) {
      return {
        ...structured,
        rawOutput: stdout,
        durationMs,
        usage: this.parseUsageFromStderr(stderr),
      };
    }

    // Last resort: infer from exit code and raw output
    const filesChanged = this.inferFilesChanged(stdout);
    const summary = this.inferSummary(stdout);

    return {
      exitCode: exitCode === 0 ? 'success' : 'failed',
      summary: summary || `Task completed with exit code ${exitCode}`,
      filesChanged,
      decisions: [],
      usage: this.parseUsageFromStderr(stderr),
      rawOutput: stdout,
      durationMs,
    };
  }

  /** Parse Claude Code's --output-format json response */
  private parseJsonOutput(stdout: string): Omit<RuntimeResult, 'durationMs'> | null {
    try {
      const data = JSON.parse(stdout);

      // Claude Code JSON output has a `result` field with the text,
      // and `usage` / `cost` fields at the top level
      const text = data.result || data.text || data.content || '';
      const costUsd = data.cost_usd ?? data.cost ?? 0;
      const inputTokens = data.input_tokens ?? data.usage?.input_tokens ?? 0;
      const outputTokens = data.output_tokens ?? data.usage?.output_tokens ?? 0;

      // Try to extract JACBOT_RESULT from inside the result text
      const structured = this.parseStructuredResult(text);

      return {
        exitCode: structured?.exitCode || 'success',
        summary: structured?.summary || this.inferSummary(text) || 'Task completed',
        filesChanged: structured?.filesChanged || this.inferFilesChanged(text),
        decisions: structured?.decisions || [],
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          estimatedCostUsd: costUsd,
        },
        rawOutput: text || stdout,
      };
    } catch {
      return null;
    }
  }

  /** Parse the JACBOT_RESULT_START block from agent output text */
  private parseStructuredResult(output: string): Omit<RuntimeResult, 'rawOutput' | 'durationMs' | 'usage'> | null {
    const match = output.match(/JACBOT_RESULT_START\n([\s\S]*?)JACBOT_RESULT_END/);
    if (!match) return null;

    const block = match[1];

    const summaryMatch = block.match(/^summary:\s*(.+)$/m);
    const exitMatch = block.match(/^exit_code:\s*(success|partial|failed)$/m);

    const filesChanged: string[] = [];
    const filesSection = block.match(/files_changed:\n((?:- .+\n?)*)/);
    if (filesSection) {
      for (const line of filesSection[1].split('\n')) {
        const fileMatch = line.match(/^- (.+)$/);
        if (fileMatch) filesChanged.push(fileMatch[1].trim());
      }
    }

    const decisions: Decision[] = [];
    const decisionsSection = block.match(/decisions:\n((?:- decision:[\s\S]*?(?=\n- decision:|\nJACBOT_RESULT_END|$))*)/);
    if (decisionsSection) {
      const decRegex = /- decision:\s*(.+)\n\s*rationale:\s*(.+)/g;
      let decMatch;
      while ((decMatch = decRegex.exec(decisionsSection[1])) !== null) {
        decisions.push({
          description: decMatch[1].trim(),
          rationale: decMatch[2].trim(),
          madeAt: new Date(),
        });
      }
    }

    return {
      exitCode: (exitMatch?.[1] as RuntimeResult['exitCode']) || 'success',
      summary: summaryMatch?.[1]?.trim() || 'Task completed',
      filesChanged,
      decisions,
    };
  }

  /** Try to extract token usage from Claude's stderr output */
  private parseUsageFromStderr(stderr: string): TokenUsage {
    // Claude Code may output usage stats to stderr
    // Format varies by version, so we try a few patterns
    const inputMatch = stderr.match(/input[_\s]tokens?:\s*(\d+)/i);
    const outputMatch = stderr.match(/output[_\s]tokens?:\s*(\d+)/i);
    const costMatch = stderr.match(/cost:\s*\$?([\d.]+)/i);

    const inputTokens = inputMatch ? parseInt(inputMatch[1], 10) : 0;
    const outputTokens = outputMatch ? parseInt(outputMatch[1], 10) : 0;

    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      estimatedCostUsd: costMatch ? parseFloat(costMatch[1]) : 0,
    };
  }

  /** Infer files changed from git-related output */
  private inferFilesChanged(output: string): string[] {
    const files = new Set<string>();

    // Look for common patterns in Claude's output
    // "Created file: path" or "Modified: path" or "wrote to path"
    const patterns = [
      /(?:created|wrote|modified|updated|edited)\s+(?:file\s+)?[`"']?([^\s`"']+\.\w+)/gi,
      /git add\s+([^\s]+)/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(output)) !== null) {
        const file = match[1].replace(/[`"']/g, '');
        if (file && !file.startsWith('-')) {
          files.add(file);
        }
      }
    }

    return Array.from(files);
  }

  /** Extract a summary from the output's last meaningful lines */
  private inferSummary(output: string): string {
    const lines = output.trim().split('\n').filter(l => l.trim().length > 0);
    if (lines.length === 0) return '';

    // Take the last non-empty line as a rough summary, truncate to 200 chars
    const last = lines[lines.length - 1].trim();
    return last.length > 200 ? last.slice(0, 197) + '...' : last;
  }
}
