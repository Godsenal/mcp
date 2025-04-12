#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequest,
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import express, { Request, Response } from "express";

const DEFAULT_USER_AGENT =
  "ModelContextProtocol/1.0 (+https://github.com/modelcontextprotocol/servers)";

interface FetchArgs {
  url: string;
}

const fetchTool: Tool = {
  name: "fetch",
  description: "Fetches content from a URL",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "URL to fetch",
      },
    },
    required: ["url"],
  },
};

class FetchClient {
  private userAgent: string;

  constructor(userAgent: string) {
    this.userAgent = userAgent;
  }

  async fetchUrl(url: string): Promise<string> {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": this.userAgent,
          "Content-Type": "text/plain; charset=UTF-8",
        },
        redirect: "follow",
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch ${url} - status code ${response.status}`
        );
      }

      return await response.text();
    } catch (error) {
      throw new Error(`Failed to fetch ${url}: ${error}`);
    }
  }
}

async function main() {
  const userAgent = process.env.MCP_USER_AGENT || DEFAULT_USER_AGENT;

  console.error("Starting Fetch MCP Server...");
  const server = new Server(
    {
      name: "Fetch MCP Server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  const fetchClient = new FetchClient(userAgent);

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request: CallToolRequest) => {
      console.error("Received CallToolRequest:", request);
      try {
        if (!request.params.arguments) {
          throw new Error("No arguments provided");
        }

        switch (request.params.name) {
          case "fetch": {
            const args = request.params.arguments as unknown as FetchArgs;
            if (!args.url) {
              throw new Error("URL is required");
            }
            const content = await fetchClient.fetchUrl(args.url);
            return {
              content: [
                {
                  type: "text",
                  text: `Contents of ${args.url}:\n${content}`,
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown tool: ${request.params.name}`);
        }
      } catch (error) {
        console.error("Error executing tool:", error);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
        };
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    console.error("Received ListToolsRequest");
    return {
      tools: [fetchTool],
    };
  });

  if (process.argv.includes("--sse")) {
    let transport: SSEServerTransport | null = null;

    const app = express();

    app.get("/sse", (req: Request, res: Response) => {
      transport = new SSEServerTransport("/messages", res);
      server.connect(transport);
    });

    app.post("/messages", (req: Request, res: Response) => {
      if (transport) {
        transport.handlePostMessage(req, res);
      }
    });

    app.listen(3000, () => {
      console.log("[sse] MCP Server running on http://localhost:3000");
    });
  } else {
    const transport = new StdioServerTransport();
    console.error("[stdio] Connecting server to transport...");
    await server.connect(transport);

    console.error("[stdio] MCP Server running on stdio");
  }
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
