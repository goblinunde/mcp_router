import type {
  RetryPlanOptions,
  RoutingCandidate,
  RoutingDecision,
  RoutingRequest,
} from "@mcp_router/shared";

export class RoutingPolicyEngine {
  public decide(
    request: RoutingRequest,
    candidates: RoutingCandidate[],
  ): RoutingDecision {
    const scoredCandidates = candidates
      .filter((candidate) => {
        if (
          request.allowedServerIds &&
          !request.allowedServerIds.has(candidate.serverId)
        ) {
          return false;
        }

        return true;
      })
      .map((candidate) => this.scoreCandidate(request, candidate))
      .sort((left, right) => {
        if (right.score === left.score) {
          return left.serverId.localeCompare(right.serverId);
        }
        return right.score - left.score;
      });

    const orderedServerIds = scoredCandidates.map(
      (candidate) => candidate.serverId,
    );
    const fallbackServerIds = (request.fallbackServerIds || []).filter(
      (serverId) => !orderedServerIds.includes(serverId),
    );
    const mergedOrder = [...orderedServerIds, ...fallbackServerIds];

    return {
      primaryServerId: mergedOrder[0] || null,
      orderedServerIds: mergedOrder,
      scores: scoredCandidates.map((candidate) => ({
        serverId: candidate.serverId,
        score: candidate.score,
        reasons: candidate.reasons,
      })),
    };
  }

  public buildRetryPlan(
    decision: RoutingDecision,
    options: RetryPlanOptions,
  ): string[] {
    if (!decision.primaryServerId) {
      return [];
    }

    const retries = Array.from({ length: options.sameServerRetries }).map(
      () => decision.primaryServerId!,
    );

    return [
      decision.primaryServerId,
      ...retries,
      ...decision.orderedServerIds.filter(
        (serverId) => serverId !== decision.primaryServerId,
      ),
    ];
  }

  private scoreCandidate(
    request: RoutingRequest,
    candidate: RoutingCandidate,
  ): RoutingDecision["scores"][number] & { serverId: string } {
    let score = candidate.priority || 0;
    const reasons: string[] = [];

    if (
      request.workspaceId &&
      candidate.workspaceId &&
      request.workspaceId === candidate.workspaceId
    ) {
      score += 40;
      reasons.push("workspace-match");
    }

    if (
      request.requiredCapability &&
      candidate.capabilities.includes(request.requiredCapability)
    ) {
      score += 30;
      reasons.push("capability-match");
    }

    if (
      request.intent &&
      candidate.capabilities.some((capability) =>
        request.intent!.toLowerCase().includes(capability.toLowerCase()),
      )
    ) {
      score += 20;
      reasons.push("intent-match");
    }

    if (
      request.modelName &&
      candidate.models?.some((model) => model === request.modelName)
    ) {
      score += 10;
      reasons.push("model-match");
    }

    return {
      serverId: candidate.serverId,
      score,
      reasons,
    };
  }
}
