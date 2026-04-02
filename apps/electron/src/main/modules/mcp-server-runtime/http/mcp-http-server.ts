import express from "express";
import cors from "cors";
import * as http from "http";
import { MCPServerManager } from "../../mcp-server-manager/mcp-server-manager";
import { AggregatorServer } from "../aggregator-server";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse";
import { getPlatformAPIManager } from "../../workspace/platform-api-manager";
import { TokenValidator } from "../token-validator";
import { ProjectRepository } from "../../projects/projects.repository";
import {
  PROJECT_HEADER,
  UNASSIGNED_PROJECT_ID,
  type GatewayAuthContext,
} from "@mcp_router/shared";

/**
 * HTTP server that exposes MCP functionality through REST endpoints
 */
export class MCPHttpServer {
  private app: express.Application;
  private server: http.Server | null = null;
  private port: number;
  private aggregatorServer: AggregatorServer;
  private tokenValidator: TokenValidator;
  // SSEセッション用のマップ
  private sseSessions: Map<string, SSEServerTransport> = new Map();
  private sseSessionProjects: Map<string, string | null> = new Map();
  private sseSessionAuthContexts: Map<string, GatewayAuthContext> = new Map();

  constructor(
    serverManager: MCPServerManager,
    port: number,
    aggregatorServer?: AggregatorServer,
  ) {
    this.aggregatorServer =
      aggregatorServer || new AggregatorServer(serverManager);
    this.port = port;
    this.app = express();
    // TokenValidatorはサーバー名とIDのマッピングが必要
    this.tokenValidator = new TokenValidator(new Map());
    this.configureMiddleware();
    this.configureRoutes();
  }

  /**
   * Configure Express middleware
   */
  private configureMiddleware(): void {
    // Parse JSON request bodies
    this.app.use(express.json());

    // Enable CORS
    this.app.use(cors());

    // 認証ミドルウェアの作成
    const authMiddleware = (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      const tokenHeader = req.headers["authorization"];
      const sessionId =
        (req.query.sessionId as string) ||
        (req.headers["mcp-session-id"] as string);

      if (!tokenHeader && sessionId) {
        const sessionAuthContext = this.sseSessionAuthContexts.get(sessionId);
        if (sessionAuthContext) {
          (req as any).gatewayAuthContext = sessionAuthContext;
          next();
          return;
        }
      }

      if (!tokenHeader) {
        res.status(401).json({
          error: "Authentication required. Please provide a valid token.",
        });
        return;
      }

      const tokenId =
        typeof tokenHeader === "string"
          ? tokenHeader.startsWith("Bearer ")
            ? tokenHeader.substring(7)
            : tokenHeader
          : "";
      const workspaceId =
        getPlatformAPIManager().getCurrentWorkspace()?.id ?? null;
      const validation = this.tokenValidator.validateToken(
        tokenId,
        workspaceId,
      );

      if (!validation.isValid) {
        res.status(validation.statusCode || 401).json({
          error: validation.error || "Invalid token. Authentication failed.",
        });
        return;
      }

      const authContext = this.tokenValidator.resolveAuthContext(
        tokenId,
        workspaceId,
      );
      if (!authContext) {
        res.status(401).json({
          error: "Invalid token. Authentication failed.",
        });
        return;
      }

      (req as any).gatewayAuthContext = authContext;
      next();
    };

    // /mcp エンドポイントを直接ルートに設定し、バージョニングなしで公開
    this.app.use("/mcp", authMiddleware);

    // /mcp/sse エンドポイントを直接ルートに設定し、バージョニングなしで公開
    this.app.use("/mcp/sse", authMiddleware);
  }

  /**
   * Configure API routes
   */
  private configureRoutes(): void {
    this.configureMcpRoute();
    this.configureMcpSseRoute();
  }

  private resolveProjectFilter(
    req: express.Request,
    options?: { skipValidation?: boolean },
  ): { projectId: string | null; provided: boolean } {
    const headerValue = req.headers[PROJECT_HEADER];
    if (headerValue === undefined) {
      return { projectId: null, provided: false };
    }

    const rawValue = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    const value = rawValue?.trim();

    if (!value) {
      return { projectId: null, provided: true };
    }

    if (value === UNASSIGNED_PROJECT_ID) {
      return { projectId: null, provided: true };
    }

    if (options?.skipValidation) {
      return { projectId: value, provided: true };
    }

    const repo = ProjectRepository.getInstance();
    const byName = repo.findByName(value);
    if (byName) {
      return { projectId: byName.id, provided: true };
    }

    const error = new Error(`Project "${value}" not found`);
    (error as any).status = 400;
    throw error;
  }

  private attachRequestMetadata(
    payload: any,
    authContext: GatewayAuthContext,
    projectId: string | null,
  ): void {
    if (payload.params && typeof payload.params === "object") {
      payload.params._meta = {
        ...(payload.params._meta || {}),
        gateway: authContext,
        projectId,
      };
    } else if (payload.params === undefined) {
      payload.params = {
        _meta: {
          gateway: authContext,
          projectId,
        },
      };
    }
  }

  /**
   * Configure direct MCP route without versioning
   */
  private configureMcpRoute(): void {
    // POST /mcp - Handle MCP requests (direct route without versioning)
    this.app.post("/mcp", async (req, res) => {
      // オリジナルのリクエストボディをコピー
      const modifiedBody = { ...req.body };

      try {
        const platformManager = getPlatformAPIManager();
        let projectFilter: string | null;
        try {
          const resolution = this.resolveProjectFilter(req, {
            skipValidation: platformManager.isRemoteWorkspace(),
          });
          projectFilter = resolution.projectId;
        } catch (error: any) {
          if (!res.headersSent) {
            res.status(error?.status || 400).json({
              jsonrpc: "2.0",
              error: {
                code: -32602,
                message:
                  error instanceof Error
                    ? error.message
                    : "Invalid project header",
              },
              id: modifiedBody.id || null,
            });
          }
          return;
        }

        // Append metadata for downstream handlers
        const authContext = (req as any).gatewayAuthContext as
          | GatewayAuthContext
          | undefined;
        if (!authContext) {
          res.status(401).json({
            error: "Authentication context missing",
          });
          return;
        }

        this.attachRequestMetadata(modifiedBody, authContext, projectFilter);
        // For local workspaces, use local aggregator
        await this.aggregatorServer
          .getTransport()
          .handleRequest(req, res, modifiedBody);
      } catch (error) {
        console.error("Error handling MCP request:", error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: "Internal server error",
            },
            id: null,
          });
        }
      }
    });
  }

  /**
   * Configure SSE route for MCP
   */
  private configureMcpSseRoute(): void {
    // GET /mcp/sse - Handle SSE connection setup
    this.app.get("/mcp/sse", async (req, res) => {
      try {
        // ヘッダーを設定
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        // SSEサーバートランスポートの作成
        const messageEndpoint = "/mcp/messages";
        const transport = new SSEServerTransport(messageEndpoint, res);

        // ユニークなセッションIDを取得
        const sessionId = transport.sessionId;

        // Check if current workspace is remote
        const platformManager = getPlatformAPIManager();
        let projectFilter: string | null;
        try {
          const resolution = this.resolveProjectFilter(req, {
            skipValidation: platformManager.isRemoteWorkspace(),
          });
          projectFilter = resolution.projectId;
        } catch (error: any) {
          if (!res.headersSent) {
            res
              .status(error?.status || 400)
              .send(
                error instanceof Error
                  ? error.message
                  : "Invalid project header",
              );
          }
          transport.close();
          return;
        }

        // セッションの保存
        this.sseSessions.set(sessionId, transport);
        this.sseSessionProjects.set(sessionId, projectFilter);
        const authContext = (req as any).gatewayAuthContext as
          | GatewayAuthContext
          | undefined;
        if (authContext) {
          this.sseSessionAuthContexts.set(sessionId, authContext);
        }

        // クライアントが切断したときのクリーンアップ
        res.on("close", () => {
          this.sseSessions.delete(sessionId);
          this.sseSessionProjects.delete(sessionId);
          this.sseSessionAuthContexts.delete(sessionId);
        });

        if (platformManager.isRemoteWorkspace()) {
          // For remote workspaces, we need to connect to remote aggregator
          // Note: This requires implementing a remote aggregator SSE endpoint
          // For now, we'll use the local aggregator but log a warning
          console.warn(
            "Remote aggregator SSE not yet implemented, using local aggregator",
          );
          await this.aggregatorServer.getAggregatorServer().connect(transport);
        } else {
          // For local workspaces, connect to local aggregator server
          await this.aggregatorServer.getAggregatorServer().connect(transport);
        }

        // セッションID情報をクライアントに送信
        res.write(`data: ${JSON.stringify({ sessionId })}\n\n`);
      } catch (error) {
        console.error("Error establishing SSE connection:", error);
        if (!res.headersSent) {
          res.status(500).send("Error establishing SSE connection");
        }
      }
    });

    // POST /mcp/messages - Handle client-to-server messages
    this.app.post("/mcp/messages", async (req, res) => {
      try {
        // セッションIDをクエリパラメータまたはヘッダーから取得
        const sessionId =
          (req.query.sessionId as string) ||
          (req.headers["mcp-session-id"] as string);

        if (!sessionId) {
          res.status(400).json({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Session ID is required",
            },
            id: null,
          });
          return;
        }

        // セッションを検索
        const transport = this.sseSessions.get(sessionId);
        if (!transport) {
          res.status(404).json({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Session not found or expired",
            },
            id: null,
          });
          return;
        }

        // リクエストボディをコピー
        const modifiedBody = { ...req.body };

        let projectFilter: string | null;
        try {
          const resolution = this.resolveProjectFilter(req);
          if (resolution.provided) {
            projectFilter = resolution.projectId;
          } else {
            projectFilter = this.sseSessionProjects.get(sessionId) ?? null;
          }
        } catch (error: any) {
          if (!res.headersSent) {
            res.status(error?.status || 400).json({
              jsonrpc: "2.0",
              error: {
                code: -32602,
                message:
                  error instanceof Error
                    ? error.message
                    : "Invalid project header",
              },
              id: modifiedBody.id || null,
            });
          }
          return;
        }

        const authContext =
          ((req as any).gatewayAuthContext as GatewayAuthContext | undefined) ||
          this.sseSessionAuthContexts.get(sessionId);
        if (!authContext) {
          res.status(401).json({
            error: "Authentication context missing",
          });
          return;
        }

        this.attachRequestMetadata(modifiedBody, authContext, projectFilter);

        // トランスポートでメッセージを処理
        await transport.handlePostMessage(req, res, modifiedBody);
      } catch (error) {
        console.error("Error handling SSE message:", error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: "Internal server error",
            },
            id: null,
          });
        }
      }
    });
  }

  /**
   * Start the HTTP server
   */
  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, "127.0.0.1", () => {
          resolve();
        });

        this.server.on("error", (error: Error) => {
          console.error("HTTP Server error:", error);
          reject(error);
        });
      } catch (error) {
        console.error("Failed to start HTTP Server:", error);
        reject(error);
      }
    });
  }

  /**
   * Stop the HTTP server
   */
  public stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((error?: Error) => {
        if (error) {
          console.error("Error stopping HTTP Server:", error);
          reject(error);
          return;
        }

        this.server = null;
        resolve();
      });
    });
  }
}
