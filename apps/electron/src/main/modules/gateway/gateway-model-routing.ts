import type {
  GatewayModelRoutingPreference,
  RoutingCandidate,
  RoutingRequest,
} from "@mcp_router/shared";

export class GatewayModelRoutingPolicy {
  public applyPreferences(
    request: RoutingRequest,
    candidates: RoutingCandidate[],
    preferences: GatewayModelRoutingPreference[],
  ): RoutingCandidate[] {
    if (!request.modelName || preferences.length === 0) {
      return candidates;
    }

    return candidates.map((candidate) => {
      const adjustedPriority = preferences.reduce((priority, preference) => {
        if (!this.matchesModel(request.modelName!, preference.modelPattern)) {
          return priority;
        }

        let nextPriority = priority;

        if (preference.preferredServerIds.includes(candidate.serverId)) {
          nextPriority += 25;
        }

        if (
          preference.preferredCapabilities?.some((capability) =>
            candidate.capabilities.includes(capability),
          )
        ) {
          nextPriority += 10;
        }

        return nextPriority;
      }, candidate.priority || 0);

      return {
        ...candidate,
        priority: adjustedPriority,
      };
    });
  }

  private matchesModel(modelName: string, pattern: string): boolean {
    if (pattern === "*") {
      return true;
    }

    if (pattern.endsWith("*")) {
      return modelName.startsWith(pattern.slice(0, -1));
    }

    return modelName === pattern;
  }
}
