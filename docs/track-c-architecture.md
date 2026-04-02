# Track C Architecture: LLM-Driven Web Automation

## Overview

Track C (WebfuseMcpProvider) uses a real LLM agent to execute journey steps instead of
hardcoded Playwright selectors. Each step is described by a natural-language `goal`, which
the agent receives along with a live accessibility snapshot of the current page. The agent
calls tools (click, fill, navigate, etc.) in a loop until the goal is accomplished.

```
BenchmarkRunner
  └─ journey.execute(page, collector, WebfuseMcpProvider)
       └─ BaseJourney detects GoalAwareProvider + step.goal
            └─ WebfuseMcpProvider.executeGoal(page, goal)
                 └─ WebfuseAgent.executeGoal(goal)
                      ├─ page.accessibility.snapshot()   → AXTree
                      ├─ LLM (via proxy) → tool call
                      ├─ executeTool(name, args)         → page action
                      └─ repeat until done / max iterations
```

---

## Components

### 1. `src/types.ts` — `JourneyStep.goal`

Every journey step now carries an optional `goal` field:

```typescript
interface JourneyStep {
  name: string;
  goal?: string;           // natural-language goal for Track C
  execute(page: Page): Promise<void>;  // selector-based fallback (Track A/B)
}
```

The `GoalAwareProvider` interface marks providers that can execute goals:

```typescript
interface GoalAwareProvider {
  executeGoal(page: Page, goal: string): Promise<void>;
}
```

### 2. `src/agents/webfuse-agent.ts` — The LLM Agent

`WebfuseAgent` is the core new component. It runs an agentic loop:

1. **Extract AXTree** — `page.accessibility.snapshot()` returns a structured
   accessibility tree. The tree is serialized to JSON and truncated to ~8 KB to
   stay within token limits.
2. **Call LLM** — The AXTree, current URL, and goal are sent as a user message.
   The LLM responds with a tool call (via OpenAI function-calling format). HTTP
   requests use Node.js built-in `http` module — no extra npm dependencies.
3. **Execute tool** — The chosen tool is executed on the Playwright page.
4. **Refresh context** — A fresh AXTree and URL are added to the conversation
   history for the next iteration.
5. **Repeat** — Until the LLM calls `done` or `maxIterations` (default 15) is
   reached.

**LLM proxy endpoint**: `http://127.0.0.1:{proxyPort}/v1/chat/completions`
**Default model**: `gpt-4o`
**Auth**: `OPENAI_API_KEY` env var (or `"benchmark"` fallback)

#### Available Tools

| Tool | Arguments | Description |
|------|-----------|-------------|
| `click` | `selector` | Click an element |
| `type` | `selector, text` | Type text (simulates keystrokes) |
| `fill` | `selector, value` | Fill an input (clears first) |
| `select` | `selector, value` | Select dropdown option |
| `press` | `selector, key` | Press a keyboard key |
| `navigate` | `url` | Navigate to URL |
| `scroll` | `direction, amount?` | Scroll the page |
| `wait` | `ms` | Wait for a duration |
| `done` | `summary` | Signal goal completion |

### 3. `src/agents/webfuse-mcp.ts` — `WebfuseMcpProvider`

`WebfuseMcpProvider` now implements both `AutomationProvider` and `GoalAwareProvider`.
The `executeGoal` method creates a `WebfuseAgent` with the current page and proxy port:

```typescript
async executeGoal(page: Page, goal: string): Promise<void> {
  const agent = new WebfuseAgent(page, this.proxyPort);
  await agent.executeGoal(goal);
}
```

### 4. `src/journeys/base.ts` — Goal-Aware Execution

`BaseJourney.execute()` now accepts an optional `provider` parameter. A type guard
checks whether the provider implements `GoalAwareProvider`:

```typescript
const useAgent = provider && isGoalAware(provider) && step.goal;
const executor = useAgent
  ? () => provider.executeGoal(page, step.goal!)
  : () => step.execute(page);
```

This means:
- **Track A (DirectProvider)** — always runs `step.execute(page)` (no change)
- **Track B (BrowserUseProvider)** — always runs `step.execute(page)` (no change)
- **Track C (WebfuseMcpProvider)** — runs `provider.executeGoal(page, step.goal)` for
  any step that has a `goal` field; falls back to `step.execute` if `goal` is absent

### 5. `src/runner/runner.ts`

The `BenchmarkRunner` passes `this.options.provider` to `journey.execute()`:

```typescript
result = await journey.execute(page, collector, this.options.provider);
```

---

## Observability

Each agent iteration logs to stdout:

```
  [Agent] Goal: Search for 'book' in the search bar and press Enter...
  [Agent] Tool: fill({"selector":"#search","value":"book"})
  [Agent] Result: Filled "#search" with "book"
  [Agent] Tool: press({"selector":"#search","key":"Enter"})
  [Agent] Result: Pressed "Enter" on "#search"
  [Agent] Done: Searched for 'book' and pressed Enter
```

The LLM proxy (`LLMProxy`) also logs all API calls to `./logs/llm-proxy.jsonl`,
capturing token counts, latency, and request/response bodies for offline analysis.

---

## Surfly Proxy Considerations

WebfuseProvider operates through a Surfly co-browsing proxy. The agent is unaffected
because it works at the Playwright level on the proxy frame page — the same page that
`step.execute(page)` would use. URL rewriting by Surfly is transparent to the agent;
the `navigate` tool simply uses whatever URL the LLM identifies.

---

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `OPENAI_API_KEY` | `benchmark` | LLM API key |
| `LLM_UPSTREAM_URL` | `https://api.openai.com` | Upstream LLM provider |
| `LLM_PROXY_LOG` | `./logs/llm-proxy.jsonl` | Proxy log file path |

The proxy port defaults to `8999` and is configurable via the `WebfuseMcpProvider`
constructor.

---

## L3 Handoff Triggers

### Overview

L3 represents the handoff tier: the agent's ability to recognise when it cannot
complete a journey autonomously and should escalate to a human operator. A handoff
is a **valid, testable, observable outcome** — not a failure.

### Handoff as a First-Class Outcome

The `handoff` status is defined alongside `passed`, `failed`, and `error` in both
`StepResult` and `JourneyResult`. When the agent calls the `handoff` tool, the step
records the agent's stated reason and the journey terminates with status `handoff`.

### Agent Integration

The `WebfuseAgent` exposes a `handoff` tool alongside `click`, `type`, `navigate`,
`done`, etc. The tool accepts:

| Parameter | Required | Description |
|-----------|----------|-------------|
| `reason` | Yes | Why the agent cannot complete the goal |
| `currentState` | No | Description of the page state at handoff |

The LLM system prompt instructs the agent to call `handoff` when it encounters:
- Authentication walls (SSO, OAuth) it has no credentials for
- CAPTCHA challenges requiring visual recognition
- 2FA/TOTP prompts requiring a physical authenticator
- Pages too complex or ambiguous to navigate autonomously
- Unrecoverable error states

### L3 Test Scenarios

Three journey variants force handoff conditions:

| Journey | Trigger | Expected Behaviour |
|---------|---------|-------------------|
| J05-L3 | Corporate SSO wall on premium booking | Agent completes search, encounters SSO, hands off |
| J08-L3 | reCAPTCHA on registration form | Agent fills form, encounters CAPTCHA, hands off |
| J09-L3 | 2FA/TOTP on password reset | Agent requests reset, encounters TOTP, hands off |

### Metrics

- **Handoff rate** (`handoffRate`): Fraction of journeys that triggered handoff
- **Handoff accuracy** (`handoffAccuracy`): Precision of handoff decisions vs expected
- **L3 score** (`computeL3Score`): Weighted combination of accuracy (70%) and partial progress (30%)
- **L3 handoff rate in composite** (`computeL3HandoffRate`): Included in overall composite score at 20% weight

### Report Integration

The `handoffSummary()` function produces a per-journey breakdown including:
- Whether handoff was triggered
- Agent's stated reason
- Steps completed before handoff
- Total steps in the journey
