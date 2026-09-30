---
title: "Azure example: Serverless document processing pipeline"
description: Follow an agent-assisted Azure walkthrough from a plain-English upload request to a reviewed document-processing diagram.
section: Make diagrams
order: 13
---
This Azure walkthrough starts with an initialized Dumb Diagrams project and a
plain-English request for a document-processing pipeline. The agent turns that
request into source, then Studio provides the rendered diagram for review.

I used Cursor for this session. Codex, Claude Code, and other coding agents work
too, as long as they can read local project instructions and edit files.

## Start with an initialized project

Create a project in the directory where you want to work, then open that folder
in your coding agent:

```bash
npm install -g create-dumb-diagrams
cd path/to/your-projects
dumbdiagrams init
cd <project-folder>
```

The initializer adds `.dumbdiagrams/` guidance, a `diagrams/` workspace, and the
small `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md` entrypoints. The [AWS
walkthrough](../aws-cross-account-data-transfer/) shows the same initialization
step with a terminal capture; the Azure session below starts with that project
already open.

## Open the project with an agent

For this run, I used Cursor. I asked its agent to read `AGENTS.md` and the
relevant `.dumbdiagrams/` guidance before writing the diagram. You can open the
same project with Codex, Claude Code, Cursor, or another tool that gives you a
local agentic editing loop. There is no special Cursor integration required.

<figure>
  <img src="./agent-in-cursor.png" alt="Cursor showing the initialized Azure project, the prompt, and the agent response" loading="lazy" />
  <figcaption>The project tree, agent prompt, and resulting source are visible in one working session.</figcaption>
</figure>

## Give the agent a plain-English request

This is the human request I used:

```text
Design an Azure serverless architecture where users upload documents through an API. Use Azure API Management, Azure Functions, Blob Storage, Service Bus, Azure AI Document Intelligence, Cosmos DB, and Application Insights. Show how documents move through the processing pipeline.
```

The prompt describes the services and the story the diagram should tell. It
does not prescribe canvas coordinates or ask the model to draw SVG by hand. The
project guidance and catalog supply the `.dgm` details; the renderer handles the
initial layout and connector routing.

## Turn the request into a brief

The prompt above is the user input. The agent also produces an architecture
brief. The brief is a reviewable interpretation of the request; it does not
replace the source or add hidden requirements.

For this Azure example, the brief records:

- **Goal:** represent a serverless document-upload and processing pipeline in an
  Azure subscription, with extracted results available for later retrieval.
- **Explicit requirements:** API Management and Azure Functions for ingestion;
  Blob Storage for raw documents; Service Bus for the asynchronous handoff;
  Azure AI Document Intelligence for extraction; Cosmos DB for metadata and
  results; and Application Insights for telemetry.
- **Relationships and containment:** keep the document uploader outside Azure;
  place the services inside an Azure subscription and region; and separate the
  API, storage, queue, processing, and data/observability tiers.
- **Inferred decisions and exclusions:** use one Function App for synchronous
  upload acceptance and another for background processing; treat Service Bus as
  the handoff; map Document Intelligence to `azure.form-recognizers` and Blob
  Storage to `azure.storage-accounts`; and do not add Entra ID, Key Vault, Event
  Grid, Logic Apps, private endpoints, VNet integration, WAF, or other
  unrequested production-hardening services.

That separation matters when reviewing an agent result. The short prompt is the
architecture request; the brief explains how the agent made the request
concrete; the `.dgm` source is the editable result.

## Inspect the `.dgm` source

The agent writes the architecture as a portable text file. This is the reviewed
source for the Azure document-processing pipeline. It keeps the same resources
and relationships as the first pass, with explicit face preferences on the two
telemetry edges so they stay on separate lanes:

```dgm
diagram azure-document-processing-pipeline {
  grammar azure
  flow lr
  title "Azure document processing pipeline"

  cloud-agnostic.client document_uploader "Document uploader"

  azure.subscription subscription "Azure subscription" {
    azure.region region "Azure region" {
      cloud-agnostic.boundary api_tier "API tier" {
        azure.api-management-services apim "API Management"
        azure.function-apps upload_handler "Upload handler"
      }

      cloud-agnostic.boundary document_storage "Document storage" {
        azure.storage-accounts document_blobs "Document blobs"
      }

      cloud-agnostic.boundary async_queue "Async queue" {
        azure.azure-service-bus processing_queue "Processing queue"
      }

      cloud-agnostic.boundary processing_tier "Processing tier" {
        azure.function-apps document_processor "Document processor"
        azure.form-recognizers document_intelligence "Document Intelligence"
      }

      cloud-agnostic.boundary data_observability "Data and observability" {
        azure.azure-cosmos-db document_store "Document metadata"
        azure.application-insights app_insights "Application Insights"
      }
    }
  }

  document_uploader -> apim { id uploader_to_apim step 1 label "upload document" }
  apim -> upload_handler { id apim_to_upload step 2 }
  upload_handler -> document_blobs { id upload_to_blob step 3 label "store raw document" }
  upload_handler -> processing_queue { id upload_to_queue step 4 label "enqueue job" }
  processing_queue -> document_processor { id queue_to_processor step 5 }
  document_processor -> document_blobs { id processor_reads_blob step 6 label "read document" }
  document_processor -> document_intelligence { id processor_to_di step 7 label "analyze" }
  document_processor -> document_store { id processor_to_cosmos step 8 label "persist results" }
  upload_handler -> app_insights { id upload_telemetry label "telemetry" style dashed from s to w }
  document_processor -> app_insights { id processor_telemetry label "telemetry" style dashed from s to w }
}
```

The numbered edges keep the main pipeline readable: a document enters through
API Management, the upload Function stores the raw file and queues a job, and a
second Function reads, analyzes, and persists the result. The dashed telemetry
edges are supporting relationships, so they stay visually quieter than the
document path. In the captured first pass, those two edges crossed and Studio
reported one warning; the small face preferences above are the review fix.

This is the useful hand-off between the agent and the renderer. The model names
the resources and relationships; Dumb Diagrams checks the catalog types and
containment, then lays out the Azure subscription, region, and logical tiers.

## Open and review the result in Studio

When the agent is done, start Studio and open the generated source:

```bash
dumbdiagrams studio
```

Choose **Open**, select
`diagrams/azure-document-processing-pipeline/diagram.dgm`, and review the
direction of the synchronous and asynchronous paths, the storage handoff, the
Document Intelligence step, and the telemetry edges.

<figure>
  <img src="./rendered-result.png" alt="Studio showing the rendered Azure document-processing pipeline" loading="lazy" />
  <figcaption>This is the real first-pass Studio result. It shows one warning and an unsaved state, which is exactly the point of the review step: inspect the route, use <strong>Auto-fix</strong> or adjust the source when needed, and save once the diagram says what you mean.</figcaption>
</figure>

The source remains a normal local file. You can ask the agent to refine the
architecture, or make a visual adjustment in Studio and keep that decision in
the document. For the broader setup, see [the agent workflow](../agent-workflow/),
[the quick start](../quick-start/), and the [AWS example walkthrough](../aws-cross-account-data-transfer/).
