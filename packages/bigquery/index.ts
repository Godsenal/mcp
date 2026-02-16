#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
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

interface GetJobArgs {
  jobId: string;
}

interface CancelJobArgs {
  jobId: string;
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

const getJobTool: Tool = {
  name: "bigquery_get_job",
  description:
    "Get detailed information about a BigQuery job including status, statistics, and configuration",
  inputSchema: {
    type: "object",
    properties: {
      jobId: {
        type: "string",
        description: "The BigQuery job ID to look up",
      },
    },
    required: ["jobId"],
  },
};

const cancelJobTool: Tool = {
  name: "bigquery_cancel_job",
  description: "Cancel a running BigQuery job",
  inputSchema: {
    type: "object",
    properties: {
      jobId: {
        type: "string",
        description: "The BigQuery job ID to cancel",
      },
    },
    required: ["jobId"],
  },
};

class BigQueryClient {
  private client: BigQuery;

  constructor(credentials: string) {
    this.client = new BigQuery({
      credentials: JSON.parse(credentials),
    });
  }

  async executeQuery(query: string, signal?: AbortSignal): Promise<any> {
    try {
      const [job] = await this.client.createQueryJob({ query });

      // Cancel BigQuery job if client aborts the request
      const onAbort = () => {
        job.cancel().catch((err) =>
          console.error("Failed to cancel BigQuery job:", err)
        );
      };

      if (signal?.aborted) {
        await job.cancel();
        return { success: false, error: "Request was cancelled", jobId: job.id };
      }

      signal?.addEventListener("abort", onAbort, { once: true });

      try {
        const [rows] = await job.getQueryResults();
        return { success: true, rows, jobId: job.id };
      } finally {
        signal?.removeEventListener("abort", onAbort);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return { success: false, error: "Request was cancelled" };
      }
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

  async getJob(jobId: string): Promise<any> {
    try {
      const job = this.client.job(jobId);
      const [metadata] = await job.getMetadata();

      return {
        success: true,
        jobId: metadata.jobReference?.jobId,
        status: {
          state: metadata.status?.state,
          errorResult: metadata.status?.errorResult,
          errors: metadata.status?.errors,
        },
        statistics: {
          creationTime: metadata.statistics?.creationTime,
          startTime: metadata.statistics?.startTime,
          endTime: metadata.statistics?.endTime,
          totalBytesProcessed:
            metadata.statistics?.query?.totalBytesProcessed,
          totalBytesBilled: metadata.statistics?.query?.totalBytesBilled,
          cacheHit: metadata.statistics?.query?.cacheHit,
          queryPlan: metadata.statistics?.query?.queryPlan,
        },
        configuration: {
          query: metadata.configuration?.query?.query,
          destinationTable:
            metadata.configuration?.query?.destinationTable,
          useLegacySql: metadata.configuration?.query?.useLegacySql,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async cancelJob(jobId: string): Promise<any> {
    try {
      const job = this.client.job(jobId);
      await job.cancel();
      const [metadata] = await job.getMetadata();

      return {
        success: true,
        jobId: metadata.jobReference?.jobId,
        status: {
          state: metadata.status?.state,
          errorResult: metadata.status?.errorResult,
        },
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
    async (request: CallToolRequest, extra) => {
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
            const response = await bigqueryClient.executeQuery(args.query, extra.signal);
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

          case "bigquery_get_job": {
            const args = request.params.arguments as unknown as GetJobArgs;
            if (!args.jobId) {
              throw new Error("Missing required argument: jobId");
            }
            const response = await bigqueryClient.getJob(args.jobId);
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          }

          case "bigquery_cancel_job": {
            const args = request.params.arguments as unknown as CancelJobArgs;
            if (!args.jobId) {
              throw new Error("Missing required argument: jobId");
            }
            const response = await bigqueryClient.cancelJob(args.jobId);
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
      tools: [executeQueryTool, dryRunQueryTool, getJobTool, cancelJobTool],
    };
  });

  if (process.argv.includes("--sse")) {
    let transport: SSEServerTransport | null = null;

    const app = express();

    app.get("/sse", (req, res) => {
      transport = new SSEServerTransport("/messages", res);
      server.connect(transport);
    });

    app.post("/messages", (req, res) => {
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
