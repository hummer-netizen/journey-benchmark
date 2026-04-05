import type { Page } from 'playwright';

/** Configuration for selectors and URLs for a specific e-commerce site */
export interface SiteConfig {
  baseUrl: string;
  selectors: {
    searchInput: string;
    searchButton: string;
    productLink: string;
    addToCartButton: string;
    cartIcon: string;
    cartCount: string;
    checkoutButton: string;
    firstNameInput: string;
    lastNameInput: string;
    addressInput: string;
    cityInput: string;
    stateInput: string;
    postcodeInput: string;
    phoneInput: string;
    placeOrderButton: string;
    orderConfirmation: string;
    productTitle: string;
    productPrice: string;
  };
  credentials: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    address: string;
    city: string;
    state: string;
    postcode: string;
    phone: string;
  };
}

/** Result of a single step execution */
export interface StepResult {
  stepIndex: number;
  stepName: string;
  status: 'passed' | 'failed' | 'skipped' | 'handoff';
  executionTimeMs: number;
  errorMessage?: string;
  /** When status is 'handoff', the reason the agent triggered a handoff */
  handoffReason?: string;
}

/** Result of a complete journey execution */
export interface JourneyResult {
  journeyId: string;
  journeyName: string;
  status: 'passed' | 'failed' | 'error' | 'handoff';
  executionTimeMs: number;
  partialCompletion: number;  // 0.0 to 1.0
  stepsTotal: number;
  stepsCompleted: number;
  steps: StepResult[];
  errorMessage?: string;
  /** When status is 'handoff', the reason the agent triggered a handoff to a human */
  handoffReason?: string;
  startedAt: string;
  finishedAt: string;
}

/** Execution level for the diagnostic framework */
export type ExecutionLevel = 1 | 2 | 3 | 4;

/** Metadata for a diagnostic run */
export interface DiagnosticInfo {
  level: ExecutionLevel;
  /** Label for the level (e.g. "L1: Scripted Playwright") */
  levelLabel: string;
}

/** Result of a complete benchmark run */
export interface RunResult {
  runId?: number;
  startedAt: string;
  finishedAt: string;
  provider: string;
  site: string;
  targetUrl: string;
  totalJourneys: number;
  passed: number;
  failed: number;
  journeys: JourneyResult[];
  /** Optional diagnostic info for 4-level framework */
  diagnostic?: DiagnosticInfo;
}

/** A single journey step definition */
export interface JourneyStep {
  name: string;
  /** Natural-language goal for LLM-driven automation (Track C / WebfuseMcpProvider) */
  goal?: string;
  execute(page: Page): Promise<void>;
}

/** Result of a goal execution by a GoalAwareProvider */
export interface GoalExecutionResult {
  /** Whether the agent completed the goal or triggered a handoff */
  outcome: 'completed' | 'handoff';
  /** When outcome is 'handoff', the agent's stated reason for triggering handoff */
  handoffReason?: string;
}

/** Provider that can execute journey steps from a natural-language goal (Track C) */
export interface GoalAwareProvider {
  executeGoal(page: Page, goal: string): Promise<void | GoalExecutionResult>;
}

/** Journey interface that all journey implementations must satisfy */
export interface Journey {
  id: string;
  name: string;
  steps: JourneyStep[];
  execute(
    page: Page,
    collector: import('./metrics/collector.js').MetricCollector,
    provider?: import('./webfuse/provider.js').AutomationProvider,
  ): Promise<JourneyResult>;
}
