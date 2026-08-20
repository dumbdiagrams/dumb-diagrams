#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import {
  createEmptyDocument,
  getResource,
  type DiagramDocument,
  type Resource,
  type Edge,
} from "@dumb-diagrams/core";
import { parseArch, printArch } from "@dumb-diagrams/dsl";
import { compileDiagram } from "@dumb-diagrams/render";

let document: DiagramDocument = createEmptyDocument("workspace");

const server = new Server(
  { name: "dumb-diagrams-mcp", version: "0.0.1" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "diagram.read",
      description: "Read the current diagram as .arch source",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "diagram.validate",
      description: "Validate the current diagram",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "diagram.load",
      description: "Load diagram from .arch source",
      inputSchema: {
        type: "object",
        properties: { source: { type: "string" } },
        required: ["source"],
      },
    },
    {
      name: "diagram.add_resource",
      description: "Add a resource to the diagram",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string" },
          id: { type: "string" },
          parent: { type: "string" },
          label: { type: "string" },
        },
        required: ["type", "id", "parent"],
      },
    },
    {
      name: "diagram.connect",
      description: "Connect two resources",
      inputSchema: {
        type: "object",
        properties: {
          source: { type: "string" },
          target: { type: "string" },
          step: { type: "number" },
        },
        required: ["source", "target"],
      },
    },
    {
      name: "diagram.render",
      description: "Render diagram to SVG",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "diagram.auto_layout",
      description: "Clear view overrides for automatic layout",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "diagram.read":
      return textResult(printArch(document));

    case "diagram.load": {
      const source = (args as { source: string }).source;
      document = parseArch(source);
      return textResult("Diagram loaded");
    }

    case "diagram.validate": {
      const result = compileDiagram(document);
      if (!result.ok) {
        return textResult(
          result.issues.map((i) => `[${i.level}] ${i.message}`).join("\n"),
        );
      }
      const warnings = result.invariantFailures.map((f) => f.message).join("\n");
      return textResult(warnings || "Valid");
    }

    case "diagram.add_resource": {
      const { type, id, parent, label } = args as {
        type: string;
        id: string;
        parent: string;
        label?: string;
      };
      const resource: Resource = {
        id,
        type,
        parent,
        label: { role: label },
        role: "primary",
        props: {},
      };
      document.resources.push(resource);
      const group = document.groups.find((g) => g.id === parent);
      group?.children.push(id);
      return textResult(`Added resource ${id}`);
    }

    case "diagram.connect": {
      const { source, target, step } = args as {
        source: string;
        target: string;
        step?: number;
      };
      const edge: Edge = {
        id: `${source}-${target}`,
        source,
        target,
        step,
        style: "solid",
      };
      document.edges.push(edge);
      return textResult(`Connected ${source} -> ${target}`);
    }

    case "diagram.render": {
      const result = compileDiagram(document);
      if (!result.ok) {
        return textResult("Render failed: validation errors");
      }
      return {
        content: [
          { type: "text", text: result.svg ?? "" },
        ],
      };
    }

    case "diagram.auto_layout": {
      for (const view of document.views) {
        view.places = {};
        view.routes = {};
      }
      return textResult("View overrides cleared");
    }

    default:
      return textResult(`Unknown tool: ${name}`);
  }
});

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
