import type { Page } from 'playwright';
import type { Journey, JourneyResult, JourneyStep, SiteConfig, GoalAwareProvider, GoalExecutionResult } from '../types.js';
import type { MetricCollector } from '../metrics/collector.js';
import type { AutomationProvider } from '../webfuse/provider.js';

/** Type guard — returns true if the provider implements GoalAwareProvider */
function isGoalAware(provider: AutomationProvider): provider is AutomationProvider & GoalAwareProvider {
  return typeof (provider as unknown as GoalAwareProvider).executeGoal === 'function';
}

/** Normalise the executeGoal return value (void | GoalExecutionResult) to GoalExecutionResult */
function normaliseGoalResult(raw: void | GoalExecutionResult): GoalExecutionResult {
  if (!raw) return { outcome: 'completed' };
  return raw;
}

/** Base class with shared execution logic for all journeys */
export abstract class BaseJourney implements Journey {
  abstract id: string;
  abstract name: string;
  abstract steps: JourneyStep[];

  protected config: SiteConfig;

  constructor(config: SiteConfig) {
    this.config = config;
  }

  async execute(
    page: Page,
    collector: MetricCollector,
    provider?: AutomationProvider,
  ): Promise<JourneyResult> {
    collector.reset();
    const startedAt = new Date().toISOString();
    const journeyStart = Date.now();
    let status: JourneyResult['status'] = 'passed';
    let errorMessage: string | undefined;

    let handoffReason: string | undefined;

    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i];
      if (!step) continue;

      // Use the LLM agent when the provider is goal-aware and the step has a goal (Track C)
      const useAgent = provider && isGoalAware(provider) && step.goal;

      if (useAgent) {
        // Goal-aware execution with handoff support
        const goalProvider = provider as AutomationProvider & GoalAwareProvider;
        const result = await collector.measureWithHandoff(i, step.name, async () => {
          const raw = await goalProvider.executeGoal(page, step.goal!);
          return normaliseGoalResult(raw);
        });
        if (result.status === 'handoff') {
          status = 'handoff';
          handoffReason = result.handoffReason;
          break;
        }
        if (result.status === 'failed') {
          status = 'failed';
          errorMessage = result.errorMessage;
          break;
        }
      } else {
        const result = await collector.measure(i, step.name, () => step.execute(page));
        if (result.status === 'failed') {
          status = 'failed';
          errorMessage = result.errorMessage;
          break;
        }
      }
    }

    const allResults = collector.getResults();
    const stepsCompleted = allResults.filter(r => r.status === 'passed').length;

    return {
      journeyId: this.id,
      journeyName: this.name,
      status,
      executionTimeMs: Date.now() - journeyStart,
      partialCompletion: this.steps.length > 0 ? stepsCompleted / this.steps.length : 0,
      stepsTotal: this.steps.length,
      stepsCompleted,
      steps: allResults,
      errorMessage,
      handoffReason,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  }
}
