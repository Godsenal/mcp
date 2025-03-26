#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequest,
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { BigQuery } from "@google-cloud/bigquery";

interface ExecuteQueryArgs {
  query: string;
}

interface DryRunQueryArgs {
  query: string;
}

// Tool definitions
const executeQueryTool: Tool = {
  name: "bigquery_execute_query",
  description: "Execute a BigQuery SQL query",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The SQL query to execute",
      },
    },
    required: ["query"],
  },
};

const dryRunQueryTool: Tool = {
  name: "bigquery_dry_run_query",
  description: "Perform a dry run of a BigQuery SQL query to estimate cost",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The SQL query to dry run",
      },
    },
    required: ["query"],
  },
};

class BigQueryClient {
  private client: BigQuery;

  constructor(credentials: string) {
    this.client = new BigQuery({
      credentials: JSON.parse(credentials),
    });
  }

  async executeQuery(query: string): Promise<any> {
    const options = {
      query,
    };

    try {
      const [job] = await this.client.createQueryJob(options);
      const [rows] = await job.getQueryResults();
      return {
        success: true,
        rows,
        jobId: job.id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async dryRunQuery(query: string): Promise<any> {
    const options = {
      query,
      dryRun: true,
    };

    try {
      const [job] = await this.client.createQueryJob(options);
      const { metadata } = job;

      // Calculate cost based on bytes processed
      // BigQuery charges $5 per TB of data processed
      const bytesProcessed = metadata.statistics.query.totalBytesProcessed;
      const costInUSD = (bytesProcessed / (1024 * 1024 * 1024 * 1024)) * 5;

      return {
        success: true,
        bytesProcessed,
        costInUSD,
        jobId: job.id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

async function main() {
  const credentials = process.env.BIGQUERY_CREDENTIALS;

  if (!credentials) {
    console.error("Please set BIGQUERY_CREDENTIALS environment variable");
    process.exit(1);
  }

  console.error("Starting BigQuery MCP Server...");
  const server = new Server(
    {
      name: "BigQuery MCP Server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  const bigqueryClient = new BigQueryClient(credentials);

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request: CallToolRequest) => {
      console.error("Received CallToolRequest:", request);
      try {
        if (!request.params.arguments) {
          throw new Error("No arguments provided");
        }

        switch (request.params.name) {
          case "bigquery_execute_query": {
            const args = request.params
              .arguments as unknown as ExecuteQueryArgs;
            if (!args.query) {
              throw new Error("Missing required argument: query");
            }
            const response = await bigqueryClient.executeQuery(args.query);
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          }

          case "bigquery_dry_run_query": {
            const args = request.params.arguments as unknown as DryRunQueryArgs;
            if (!args.query) {
              throw new Error("Missing required argument: query");
            }
            const response = await bigqueryClient.dryRunQuery(args.query);
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
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
      tools: [executeQueryTool, dryRunQueryTool],
    };
  });

  const transport = new StdioServerTransport();
  console.error("Connecting server to transport...");
  await server.connect(transport);

  console.error("BigQuery MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
