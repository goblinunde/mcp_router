import type {
  GatewayPermission,
  GatewayWorkflowDefinition,
  GatewayWorkflowExecutionResult,
  GatewayWorkflowStep,
} from "@mcp_router/shared";

export class GatewayWorkflowOrchestrator {
  public validateDefinition(definition: GatewayWorkflowDefinition): void {
    if (!definition.id || !definition.name) {
      throw new Error("Gateway workflow requires id and name");
    }

    if (!definition.steps || definition.steps.length === 0) {
      throw new Error("Gateway workflow requires at least one step");
    }
  }

  public async executeSequential(
    definition: GatewayWorkflowDefinition,
    allowedPermissions: Set<GatewayPermission>,
    executeStep: (step: GatewayWorkflowStep) => Promise<unknown>,
  ): Promise<GatewayWorkflowExecutionResult> {
    this.validateDefinition(definition);

    const missingPermission = (definition.requiredPermissions || []).find(
      (permission) => !allowedPermissions.has(permission),
    );
    if (missingPermission) {
      throw new Error(
        `Workflow ${definition.id} requires permission ${missingPermission}`,
      );
    }

    const executedSteps: GatewayWorkflowExecutionResult["executedSteps"] = [];

    for (const step of definition.steps) {
      try {
        if (step.kind === "delay") {
          await this.delay(step.delayMs || 0);
          executedSteps.push({
            stepId: step.id,
            status: "completed",
          });
          continue;
        }

        const output = await executeStep(step);
        executedSteps.push({
          stepId: step.id,
          status: "completed",
          serverId: step.serverId,
          output,
        });
      } catch (error) {
        executedSteps.push({
          stepId: step.id,
          status: "failed",
          serverId: step.serverId,
          error: error instanceof Error ? error.message : String(error),
        });

        return {
          workflowId: definition.id,
          status: "failed",
          executedSteps,
        };
      }
    }

    return {
      workflowId: definition.id,
      status: "completed",
      executedSteps,
    };
  }

  private async delay(durationMs: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, durationMs));
  }
}
