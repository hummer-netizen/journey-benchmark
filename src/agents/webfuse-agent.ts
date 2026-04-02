import * as http from 'node:http';
import * as https from 'node:https';
import type { Page } from 'playwright';
import type { GoalExecutionResult } from '../types.js';
import type { AutomationApi } from '../webfuse/automation-api.js';

// ---------------------------------------------------------------------------
// OpenAI-compatible types (subset)
// ---------------------------------------------------------------------------

interface ToolFunction {
  name: string;
  arguments: string;
}

interface ToolCall {
  id: string;
  type: 'function';
  function: ToolFunction;
}

interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ChatChoice {
  message: {
    role: string;
    content: string | null;
    tool_calls?: ToolCall[];
  };
  finish_reason: string;
}

interface ChatResponse {
  choices: ChatChoice[];
  error?: { message: string };
}

// ---------------------------------------------------------------------------
// Tool schema definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'click',
      description: 'Click an element on the page using a CSS selector. Use button="right" for right-click (context menu).',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector for the element to click' },
          button: { type: 'string', enum: ['left', 'right'], description: 'Mouse button to click. Default is left. Use right for context menus.' },
        },
        required: ['selector'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'type',
      description: 'Type text into a focused or targeted element (simulates keystrokes)',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector for the input element' },
          text: { type: 'string', description: 'Text to type' },
        },
        required: ['selector', 'text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fill',
      description: 'Fill a form field with a value (clears existing value first)',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector for the input element' },
          value: { type: 'string', description: 'Value to fill in' },
        },
        required: ['selector', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'select',
      description: 'Select an option in a dropdown/select element',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector for the select element' },
          value: { type: 'string', description: 'Value or label of the option to select' },
        },
        required: ['selector', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'press',
      description: 'Press a keyboard key on a focused element',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector for the element to focus' },
          key: { type: 'string', description: 'Key to press (e.g. Enter, Tab, Escape, ArrowDown)' },
        },
        required: ['selector', 'key'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'navigate',
      description: 'Navigate the browser to a URL',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Full URL to navigate to' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'scroll',
      description: 'Scroll the page up or down',
      parameters: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['up', 'down'], description: 'Scroll direction' },
          amount: { type: 'number', description: 'Pixels to scroll (default 400)' },
        },
        required: ['direction'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'wait',
      description: 'Wait for a specified number of milliseconds',
      parameters: {
        type: 'object',
        properties: {
          ms: { type: 'number', description: 'Milliseconds to wait' },
        },
        required: ['ms'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'done',
      description: 'Signal that the goal has been fully completed',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Brief summary of what was accomplished' },
        },
        required: ['summary'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'handoff',
      description: 'Signal that the goal cannot be completed autonomously and requires human intervention. Use when: the task is too complex or ambiguous, an authentication wall blocks progress, a CAPTCHA or 2FA challenge appears, external approval is needed, or the page state is unrecoverable.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Why the agent cannot complete this goal autonomously' },
          currentState: { type: 'string', description: 'Description of the current page/journey state at the point of handoff' },
        },
        required: ['reason'],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// WebfuseAgent
// ---------------------------------------------------------------------------

export interface WebfuseAgentOptions {
  maxIterations?: number;
  model?: string;
  /** Automation API instance — if provided, extractAXTree uses accessibilityTree instead of page.evaluate */
  automationApi?: AutomationApi;
  /** Session ID — required when automationApi is provided */
  sessionId?: string;
}

/**
 * LLM-driven agent for executing journey steps via natural-language goals.
 *
 * Uses the Playwright Page's accessibility tree as context, calls an LLM
 * (via the in-process proxy at proxyPort) with OpenAI function-calling, and
 * executes the returned tool calls until the LLM signals `done` or the
 * iteration limit is reached.
 */
export class WebfuseAgent {
  private readonly page: Page;
  private readonly proxyPort: number;
  private readonly maxIterations: number;
  private readonly model: string;
  private readonly automationApi: AutomationApi | undefined;
  private readonly sessionId: string | undefined;

  constructor(page: Page, proxyPort: number, options: WebfuseAgentOptions = {}) {
    this.page = page;
    this.proxyPort = proxyPort;
    this.maxIterations = options.maxIterations ?? 15;
    this.model = options.model ?? 'gpt-4o';
    this.automationApi = options.automationApi;
    this.sessionId = options.sessionId;
  }

  /** Execute a natural-language goal on the current page state */
  async executeGoal(goal: string): Promise<GoalExecutionResult> {
    console.log(`  [Agent] Goal: ${goal}`);

    const axTree = await this.extractAXTree();
    const pageUrl = this.page.url();

    const messages: Message[] = [
      {
        role: 'system',
        content: [
          'You are a web automation agent. Given the current page accessibility tree and a goal,',
          'decide which tool to call to make progress toward that goal.',
          'Always call exactly one tool per turn. When the goal is complete, call `done`.',
          '',
          'CRITICAL SELECTOR RULES:',
          '- ALWAYS prefer #id selectors (e.g. #gym-date, #gym-exercise, #gym-context-area).',
          '- NEVER use [source="..."] selectors — these are tree node refs, not DOM attributes.',
          '- For date/text inputs: use `fill` with the correct #id selector.',
          '- For <select> dropdowns: use `select` with the #id and the option value (lowercase).',
          '- For right-click: use `click` with button="right".',
          '- After fill/type, press Tab to trigger change events if needed.',
          '',
          'If an action fails, try an alternative approach.',
          'Do NOT use javascript: URLs or navigate to javascript: — they are blocked.',
          'Do NOT try more than 3 different approaches for the same sub-task.',
          'Focus on standard HTML form interactions: fill, select, click, press.',
          'After each action, check the accessibility tree for status messages to verify.',
          'When you see a success status message confirming the goal, call `done` immediately.',
        ].join(' '),
      },
      {
        role: 'user',
        content: [
          `Current URL: ${pageUrl}`,
          `Goal: ${goal}`,
          '',
          'Accessibility tree (truncated):',
          axTree,
        ].join('\n'),
      },
    ];

    for (let i = 0; i < this.maxIterations; i++) {
      const response = await this.callLLM(messages);

      if (response.error) {
        throw new Error(`LLM error: ${response.error.message}`);
      }

      const choice = response.choices[0];
      if (!choice) throw new Error('LLM returned no choices');

      const assistantMessage = choice.message;

      // Add assistant turn to history
      messages.push({
        role: 'assistant',
        content: assistantMessage.content ?? null,
        tool_calls: assistantMessage.tool_calls,
      });

      // No tool calls — treat as done if LLM says so in content
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        console.log(`  [Agent] No tool call returned — treating as done`);
        return { outcome: 'completed' };
      }

      // Process ALL tool calls (Anthropic requires tool_result for every tool_use)
      let doneResult: GoalExecutionResult | null = null;
      let handoffResult: GoalExecutionResult | null = null;

      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name;
        let toolArgs: Record<string, unknown> = {};
        try {
          toolArgs = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
        } catch {
          toolArgs = {};
        }

        console.log(`  [Agent] Tool: ${toolName}(${JSON.stringify(toolArgs)})`);

        if (toolName === 'done') {
          console.log(`  [Agent] Done: ${toolArgs['summary'] as string}`);
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: 'Goal completed.',
          });
          doneResult = { outcome: 'completed' };
          continue;
        }

        if (toolName === 'handoff') {
          const reason = toolArgs['reason'] as string;
          const currentState = toolArgs['currentState'] as string | undefined;
          console.log(`  [Agent] Handoff triggered: ${reason}`);
          if (currentState) console.log(`  [Agent] State: ${currentState}`);
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: 'Handoff acknowledged. Human operator will take over.',
          });
          handoffResult = { outcome: 'handoff', handoffReason: reason };
          continue;
        }

        // Execute the tool
        const result = await this.executeTool(toolName, toolArgs);
        console.log(`  [Agent] Result: ${result}`);

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result,
        });
      }

      // If done or handoff was signalled, return after processing all tool_results
      if (doneResult) return doneResult;
      if (handoffResult) return handoffResult;

      // Update page context for next iteration
      const updatedTree = await this.extractAXTree();
      const updatedUrl = this.page.url();

      // Add fresh page state as next user message
      messages.push({
        role: 'user',
        content: [
          `Current URL: ${updatedUrl}`,
          'Updated accessibility tree:',
          updatedTree,
          '',
          `Reminder — goal: ${goal}`,
          'Call `done` when the goal is fully accomplished.',
        ].join('\n'),
      });
    }

    // Max iterations reached — treat as handoff (agent couldn't complete autonomously)
    return {
      outcome: 'handoff',
      handoffReason: `Agent exceeded max iterations (${this.maxIterations}) for goal: ${goal}`,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Extract id, class, and tag info from DOM snapshot HTML for selector hints */
  private extractIdHints(domHtml: string): string {
    if (!domHtml) return '';
    const hints: string[] = [];
    // Match elements with id attributes
    const idRegex = /<(\w+)([^>]*?)\bid=["']([^"']+)["']([^>]*?)>/gi;
    let match;
    while ((match = idRegex.exec(domHtml)) !== null) {
      const tag = match[1]!;
      const allAttrs = match[2]! + ' id="' + match[3] + '"' + match[4]!;
      const id = match[3]!;
      // Extract useful attributes
      const typeMatch = allAttrs.match(/\btype=["']([^"']+)["']/);
      const nameMatch = allAttrs.match(/\bname=["']([^"']+)["']/);
      const ariaLabel = allAttrs.match(/\baria-label=["']([^"']+)["']/);
      const classMatch = allAttrs.match(/\bclass=["']([^"']+)["']/);
      const dataAction = allAttrs.match(/\bdata-action=["']([^"']+)["']/);
      
      let hint = `#${id} (${tag}`;
      if (typeMatch) hint += `, type=${typeMatch[1]}`;
      if (nameMatch) hint += `, name=${nameMatch[1]}`;
      if (ariaLabel) hint += `, aria-label="${ariaLabel[1]}"`;
      if (classMatch) hint += `, class="${classMatch[1].substring(0, 60)}"`;
      if (dataAction) hint += `, data-action="${dataAction[1]}"`;
      hint += ')';
      hints.push(hint);
    }
    return hints.slice(0, 50).join('\n');
  }

  private async extractAXTree(): Promise<string> {
    // Use Automation API accessibility tree + DOM snapshot when available (WebfuseProvider path)
    if (this.automationApi && this.sessionId) {
      try {
        const [axTree, domSnapshot] = await Promise.all([
          this.automationApi.accessibilityTree(this.sessionId).catch(() => ''),
          this.automationApi.domSnapshot(this.sessionId, { webfuseIDs: true }).catch(() => ''),
        ]);

        // Extract element IDs and key attributes from DOM snapshot for selector hints
        const idHints = this.extractIdHints(domSnapshot);

        let result = axTree || '(accessibility tree unavailable)';
        if (idHints) {
          result += '\n\n--- DOM Element IDs (use these as CSS selectors) ---\n' + idHints;
        }
        return result.length > 12000 ? result.slice(0, 12000) + '\n... (truncated)' : result;
      } catch {
        // fall through to page.evaluate fallback
      }
    }

    try {
      // Build a simplified page context by querying the DOM directly.
      // page.accessibility was removed in Playwright ≥1.44; this approach
      // works across all versions.
      const info = await this.page.evaluate(() => {
        interface ElementInfo {
          role: string;
          name: string;
          value?: string;
          id?: string;
        }
        const elements: ElementInfo[] = [];

        const text = (el: Element): string =>
          ((el as HTMLElement).innerText ?? el.textContent ?? '').trim().slice(0, 80);
        const label = (el: Element): string | undefined => {
          const id = (el as HTMLElement).id;
          if (id) return document.querySelector(`label[for="${id}"]`)?.textContent?.trim() ?? undefined;
          return undefined;
        };

        document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]').forEach(el => {
          const name = text(el) || (el as HTMLInputElement).value || el.getAttribute('aria-label') || '';
          if (name) elements.push({ role: 'button', name, id: (el as HTMLElement).id || undefined });
        });

        document.querySelectorAll('a[href]').forEach(el => {
          const name = text(el) || el.getAttribute('aria-label') || el.getAttribute('href') || '';
          if (name) elements.push({ role: 'link', name });
        });

        document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea').forEach(el => {
          const inp = el as HTMLInputElement;
          const name = label(el) || inp.placeholder || inp.name || el.getAttribute('aria-label') || '';
          elements.push({
            role: inp.type || 'textbox',
            name,
            value: inp.value || undefined,
            id: inp.id || inp.name || undefined,
          });
        });

        document.querySelectorAll('select').forEach(el => {
          const sel = el as HTMLSelectElement;
          const name = label(el) || sel.name || el.getAttribute('aria-label') || '';
          const options = Array.from(sel.options).map(o => o.text.trim()).slice(0, 10).join(', ');
          elements.push({
            role: 'combobox',
            name,
            value: sel.value || undefined,
            id: sel.id || sel.name || undefined,
          });
          if (options) elements.push({ role: 'options', name: options });
        });

        return {
          title: document.title,
          headings: Array.from(document.querySelectorAll('h1,h2,h3')).map(h => text(h)).filter(Boolean).slice(0, 5),
          elements: elements.slice(0, 80),
        };
      });

      const json = JSON.stringify(info, null, 2);
      return json.length > 8000 ? json.slice(0, 8000) + '\n... (truncated)' : json;
    } catch {
      return '(page context unavailable)';
    }
  }

  private get useAnthropic(): boolean {
    return !process.env['OPENAI_API_KEY'] && !!process.env['ANTHROPIC_API_KEY'];
  }

  private get anthropicModel(): string {
    return process.env['ANTHROPIC_MODEL'] ?? 'claude-sonnet-4-20250514';
  }

  private callLLM(messages: Message[]): Promise<ChatResponse> {
    if (this.useAnthropic) {
      return this.callAnthropicLLM(messages);
    }
    return this.callOpenAILLM(messages);
  }

  /** Convert OpenAI-style messages + tools to Anthropic Messages API and translate response back */
  private callAnthropicLLM(messages: Message[]): Promise<ChatResponse> {
    return new Promise((resolve, reject) => {
      // Extract system message
      const systemMessages = messages.filter(m => m.role === 'system');
      const systemText = systemMessages.map(m => m.content ?? '').join('\n');

      // Convert non-system messages to Anthropic format
      // Anthropic requires consecutive tool_result blocks to be merged into a single user message
      const anthropicMessages: Array<Record<string, unknown>> = [];
      for (let mi = 0; mi < messages.length; mi++) {
        const msg = messages[mi]!;
        if (msg.role === 'system') continue;

        if (msg.role === 'user') {
          // Merge with previous user message if last was also user (avoids consecutive user messages)
          const last = anthropicMessages[anthropicMessages.length - 1];
          if (last && last['role'] === 'user' && typeof last['content'] === 'string') {
            last['content'] = (last['content'] as string) + '\n' + (msg.content ?? '');
          } else {
            anthropicMessages.push({ role: 'user', content: msg.content ?? '' });
          }
        } else if (msg.role === 'assistant') {
          const content: Array<Record<string, unknown>> = [];
          if (msg.content) {
            content.push({ type: 'text', text: msg.content });
          }
          if (msg.tool_calls) {
            for (const tc of msg.tool_calls) {
              let parsedInput: Record<string, unknown> = {};
              try { parsedInput = JSON.parse(tc.function.arguments); } catch {}
              content.push({
                type: 'tool_use',
                id: tc.id,
                name: tc.function.name,
                input: parsedInput,
              });
            }
          }
          if (content.length > 0) {
            anthropicMessages.push({ role: 'assistant', content });
          }
        } else if (msg.role === 'tool') {
          // Merge consecutive tool_result blocks into the same user message
          const last = anthropicMessages[anthropicMessages.length - 1];
          const toolResultBlock = {
            type: 'tool_result',
            tool_use_id: msg.tool_call_id,
            content: msg.content ?? '',
          };
          if (last && last['role'] === 'user' && Array.isArray(last['content']) &&
              (last['content'] as Array<Record<string, unknown>>).every((b: Record<string, unknown>) => b['type'] === 'tool_result')) {
            (last['content'] as Array<Record<string, unknown>>).push(toolResultBlock);
          } else {
            anthropicMessages.push({
              role: 'user',
              content: [toolResultBlock],
            });
          }
        }
      }

      // Convert OpenAI tool schemas to Anthropic format
      const anthropicTools = TOOLS.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }));

      const body = JSON.stringify({
        model: this.anthropicModel,
        max_tokens: 4096,
        system: systemText,
        messages: anthropicMessages,
        tools: anthropicTools,
        tool_choice: { type: 'auto' },
      });

      const reqOptions: https.RequestOptions = {
        hostname: 'api.anthropic.com',
        port: 443,
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'x-api-key': process.env['ANTHROPIC_API_KEY']!,
          'anthropic-version': '2023-06-01',
        },
      };

      const req = https.request(reqOptions, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => {
          try {
            const anthropicResp = JSON.parse(data) as Record<string, unknown>;

            if (anthropicResp['error']) {
              const err = anthropicResp['error'] as Record<string, string>;
              resolve({ choices: [], error: { message: err['message'] ?? 'Anthropic API error' } });
              return;
            }

            // Translate Anthropic response to OpenAI ChatResponse format
            const content = anthropicResp['content'] as Array<Record<string, unknown>> ?? [];
            const stopReason = anthropicResp['stop_reason'] as string;

            let textContent: string | null = null;
            const toolCalls: ToolCall[] = [];

            for (const block of content) {
              if (block['type'] === 'text') {
                textContent = block['text'] as string;
              } else if (block['type'] === 'tool_use') {
                toolCalls.push({
                  id: block['id'] as string,
                  type: 'function',
                  function: {
                    name: block['name'] as string,
                    arguments: JSON.stringify(block['input']),
                  },
                });
              }
            }

            const choice: ChatChoice = {
              message: {
                role: 'assistant',
                content: textContent,
                tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
              },
              finish_reason: stopReason === 'tool_use' ? 'tool_calls' : 'stop',
            };

            resolve({ choices: [choice] });
          } catch {
            reject(new Error(`Failed to parse Anthropic response (status ${res.statusCode}): ${data.slice(0, 200)}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(120000, () => {
        req.destroy();
        reject(new Error('Anthropic LLM request timed out after 120s'));
      });
      req.write(body);
      req.end();
    });
  }

  private callOpenAILLM(messages: Message[]): Promise<ChatResponse> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        model: this.model,
        messages,
        tools: TOOLS,
        tool_choice: 'auto',
      });

      const reqOptions: http.RequestOptions = {
        hostname: '127.0.0.1',
        port: this.proxyPort,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'Authorization': `Bearer ${process.env['OPENAI_API_KEY'] ?? 'benchmark'}`,
        },
      };

      const req = http.request(reqOptions, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data) as ChatResponse);
          } catch {
            reject(new Error(`Failed to parse LLM response (status ${res.statusCode}): ${data.slice(0, 200)}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(60000, () => {
        req.destroy();
        reject(new Error('LLM request timed out after 60s'));
      });
      req.write(body);
      req.end();
    });
  }

  private async executeTool(name: string, args: Record<string, unknown>): Promise<string> {
    try {
      switch (name) {
        case 'click': {
          const sel = args['selector'] as string;
          const btn = (args['button'] as string) ?? 'left';
          await this.page.click(sel, { timeout: 10000, button: btn as 'left' | 'right' | 'middle' });
          await this.page.waitForTimeout(500);
          return btn === 'right' ? `Right-clicked "${sel}"` : `Clicked "${sel}"`;
        }
        case 'type': {
          const sel = args['selector'] as string;
          const text = args['text'] as string;
          await this.page.type(sel, text, { timeout: 10000 });
          return `Typed "${text}" into "${sel}"`;
        }
        case 'fill': {
          const sel = args['selector'] as string;
          const value = args['value'] as string;
          await this.page.fill(sel, value, { timeout: 10000 });
          return `Filled "${sel}" with "${value}"`;
        }
        case 'select': {
          const sel = args['selector'] as string;
          const value = args['value'] as string;
          // Try selecting by value first, then by label
          await this.page.selectOption(sel, value, { timeout: 10000 }).catch(async () => {
            await this.page.selectOption(sel, { label: value }, { timeout: 10000 });
          });
          return `Selected "${value}" in "${sel}"`;
        }
        case 'press': {
          const sel = args['selector'] as string;
          const key = args['key'] as string;
          await this.page.press(sel, key, { timeout: 10000 });
          await this.page.waitForTimeout(300);
          return `Pressed "${key}" on "${sel}"`;
        }
        case 'navigate': {
          const url = args['url'] as string;
          if (url.startsWith('javascript:')) {
            return 'Error: javascript: URLs are not supported. Use fill, type, click, select, or set_value tools instead.';
          }
          await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await this.page.waitForTimeout(1000);
          return `Navigated to "${url}"`;
        }
        case 'scroll': {
          const direction = args['direction'] as string;
          const amount = (args['amount'] as number | undefined) ?? 400;
          if (this.automationApi && this.sessionId) {
            const delta = direction === 'down' ? amount : -amount;
            await this.automationApi.scroll(this.sessionId, 'body', delta);
          } else {
            const delta = direction === 'down' ? amount : -amount;
            await this.page.evaluate((dy: number) => window.scrollBy(0, dy), delta);
          }
          await this.page.waitForTimeout(300);
          return `Scrolled ${direction} by ${amount}px`;
        }
        case 'wait': {
          const ms = args['ms'] as number;
          await this.page.waitForTimeout(ms);
          return `Waited ${ms}ms`;
        }
        default:
          return `Unknown tool: ${name}`;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Error: ${msg}`;
    }
  }
}
