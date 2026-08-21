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
  normalizeSingleLineText,
  type DiagramDocument,
  type Resource,
  type Edge,
} from "@dumb-diagrams/core";
import { parseDgm, printDgm } from "@dumb-diagrams/dsl";
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
      description: "Read the current diagram as .dgm source",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "diagram.validate",
      description: "Validate the current diagram",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "diagram.load",
      description: "Load diagram from .dgm source",
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
      return textResult(printDgm(document));

    case "diagram.load": {
      const source = (args as { source?: unknown }).source;
      if (typeof source !== "string") return textResult("Load failed: source must be a string");
      const candidate = parseDgm(source);
      const issue = firstValidationError(candidate);
      if (issue) return textResult(`Load failed: ${issue}`);
      document = candidate;
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
      if (typeof type !== "string" || typeof id !== "string" || typeof parent !== "string" || (label !== undefined && typeof label !== "string")) {
        return textResult("Add failed: type, id, parent, and label must be strings");
      }
      const candidate = structuredClone(document);
      const resource: Resource = {
        id: normalizeSingleLineText(id),
        type: normalizeSingleLineText(type),
        parent: normalizeSingleLineText(parent),
        label: { role: label === undefined ? undefined : normalizeSingleLineText(label) },
        role: "primary",
        props: {},
      };
      candidate.resources.push(resource);
      const group = candidate.groups.find((g) => g.id === resource.parent);
      group?.children.push(resource.id);
      const issue = firstValidationError(candidate);
      if (issue) return textResult(`Add failed: ${issue}`);
      document = candidate;
      return textResult(`Added resource ${id}`);
    }

    case "diagram.connect": {
      const { source, target, step } = args as {
        source: string;
        target: string;
        step?: number;
      };
      if (typeof source !== "string" || typeof target !== "string" || (step !== undefined && typeof step !== "number")) {
        return textResult("Connect failed: source and target must be strings and step must be numeric");
      }
      const candidate = structuredClone(document);
      const edge: Edge = {
        id: `${source}-${target}`,
        source,
        target,
        step,
        style: "solid",
      };
      candidate.edges.push(edge);
      const issue = firstValidationError(candidate);
      if (issue) return textResult(`Connect failed: ${issue}`);
      document = candidate;
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

function firstValidationError(candidate: DiagramDocument): string | null {
  const result = compileDiagram(candidate);
  return result.ok ? null : result.issues.find((issue) => issue.level === "error")?.message ?? "invalid diagram";
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
