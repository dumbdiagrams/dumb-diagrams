---
title: "AWS example: Cross-account data transfer platform"
description: Follow a real agent-assisted walkthrough from dumbdiagrams init to a rendered cross-account AWS architecture diagram.
section: Start here
order: 2.5
---
This **AWS example** follows a real working session from an empty project to a
reviewed diagram. I used Cursor, but the same steps work with Codex, Claude Code,
or another coding agent that can read local instructions and edit files.

The model works beside the source files. Dumb Diagrams validates and renders
what it writes, which makes the agent workflow a straightforward way to create
a first draft.

## Start with a fresh project

From the directory where you want the project to live, install the CLI and run
`init`:

```bash
npm install -g create-dumb-diagrams
cd path/to/your-projects
dumbdiagrams init
```

The initializer asks for a project name, creates the project folder, and adds
the `.dumbdiagrams/` guidance, a `diagrams/` workspace, and the small agent
entrypoint files. The work stays in ordinary local files, so you can open the
folder in whichever agent you already use.

<figure>
  <img src="./init-project.png" alt="A terminal running dumbdiagrams init and asking for a project name" loading="lazy" />
  <figcaption>The project begins with a normal <code>dumbdiagrams init</code> run.</figcaption>
</figure>

## Open the project with an agent

For this walkthrough, I used Cursor. I opened the initialized folder there and
let its agent read the project guidance before creating the diagram. You can do
the same with Codex, Claude Code, Cursor, or another tool that gives you a
local, agentic editing loop. There is no special Cursor integration required.

<figure>
  <img src="./agent-in-cursor.jpeg" alt="Cursor showing the initialized project, the generated diagram source, and the agent response" loading="lazy" />
  <figcaption>This is the working session used for the example. The agent panel reports the cross-account run; the editor can have another example open in a neighboring tab while you work.</figcaption>
</figure>

## Give the agent a plain-English request

Before asking for source, have the agent read `AGENTS.md` and the relevant
`.dumbdiagrams/` guidance. Then describe the architecture normally. This is the
user request I used:

```text
Design a cross-account AWS data transfer platform. The customer account should host a public web UI using CloudFront and S3, support authentication through Cognito or an existing OpenID Connect provider, and expose a GraphQL backend through AppSync. Use Lambda and Step Functions to orchestrate deployment of transfer plugins, and run the actual transfer workloads on Fargate. Store transfer task information in DynamoDB. Keep shared deployment templates and container artefacts in a separate AWS-managed account using S3, ECR, and CloudFormation templates.
```

That prompt says what the architecture needs to communicate. It does not ask
the model to guess SVG coordinates or manually place every shape. The project
instructions and catalog provide the source-language details; the renderer
handles initial layout and routing.

## Use a fast, inexpensive model for the first draft

This run used Composer 2.5, one of the cheaper and faster model choices for this
kind of work. The diagram took only a few seconds to generate, and the model was
conservative with tokens. The usage capture records an on-demand `composer-2.5`
run using 338.6K tokens at a cost of $0.08:

<figure>
  <img src="./composer-cost.jpeg" alt="Composer 2.5 usage showing 338.6K tokens and a cost of $0.08" loading="lazy" />
  <figcaption>The exact price will vary with provider, account, and prompt. The usage capture makes the cost-efficiency visible. The useful lesson is that this kind of structured source generation does not require a top frontier model: a quick, inexpensive model can follow the local instructions and produce a valid first draft.</figcaption>
</figure>

## Separate the request from the generated interpretation

The prompt above is the human input. The agent also writes an architecture
brief beside the `.dgm` source. That brief is a reviewable, normalized
interpretation of the request; it is not a second user instruction or hidden
model reasoning.

For this AWS example, the generated brief captures four things:

- **Goal:** model a cross-account data-transfer platform with a customer-facing
  control plane, a plugin deployment workflow, and managed-account artefacts.
- **Explicit requirements:** CloudFront and S3 for the public UI; Cognito or
  OpenID Connect for authentication; AppSync, Lambda, Step Functions,
  CloudFormation, Fargate, and DynamoDB in the customer account; and S3, ECR,
  and CloudFormation templates in the separate AWS-managed account.
- **Relationships and containment:** keep the customer account and managed
  account as distinct boundaries; keep Cognito and OpenID Connect as
  alternative authentication peers; and show the API, deployment, and workload
  paths in order.
- **Inferred decisions and exclusions:** represent Step Functions with the
  workflow boundary instead of adding a redundant icon, keep the layout compact,
  and avoid adding unrelated services such as queues, WAF, VPC networking, or
  monitoring that were not requested.

Keep each prompt paired with its own brief. The repository also contains an
image-thumbnail pipeline example, but its interpretation describes a different
architecture and should not be substituted for this AWS data-transfer brief.

## Inspect the generated `.dgm` source

The agent produces architecture source, not a pile of canvas coordinates. The
source below is the canonical version of this example in the repository:

```dgm
diagram aws-data-transfer-hub {
  grammar aws
  flow lr
  title "AWS Data Transfer Hub"

  cloud-agnostic.actor user "User"

  aws.cloud cloud "AWS Cloud" {
    aws.account customer "Customer's AWS Account" {
      cloud-agnostic.boundary auth "Authentication" {
        aws.cognito cognito "Amazon Cognito" { label-position top }
        cloud-agnostic.identity oidc "OpenID Connect" { label-position top }
      }

      aws.dynamodb state "Data transfer task information"

      cloud-agnostic.boundary frontend "Public web UI" {
        label-position top-right
        cloud-agnostic.client ui "Data Transfer Hub UI"
        aws.cloudfront cloudfront "Amazon CloudFront"
        aws.simple-storage-service ui_bucket "Static web assets"
      }

      aws.aws-appsync appsync "GraphQL backend API"
      aws.aws-lambda api_lambda "API Lambda"

      cloud-agnostic.boundary workflow "AWS Step Functions workflow" {
        aws.aws-lambda workflow_lambda "Workflow Lambda"
        aws.aws-cloudformation cloudformation "Plugin deployment"
      }

      cloud-agnostic.boundary workloads "Application workloads" {
        aws.aws-fargate fargate "Plugin transfer tasks"
      }
    }

    aws.account managed "AWS Managed Account" {
      aws.aws-cloudformation-template s3_component "S3 replication component template"
      aws.aws-cloudformation-template dynamodb_component "DynamoDB replication component template"
      aws.simple-storage-service templates "Centralized plugin templates"
      aws.aws-cloudformation-template ecr_component "ECR replication component template"
      aws.elastic-container-registry ecr "Plugin container images"
      aws.elastic-container-registry-image ecr_image "ECR replication Docker image"
    }
  }

  user -> ui { from s to w }
  ui -> cloudfront { step 1 }
  cloudfront -> ui_bucket
  ui -> appsync { step 2 from n to w }
  ui -> cognito { step 3 from n to s style dashed kind peer }
  ui -> oidc { from n to s style dashed kind peer }
  appsync -> api_lambda { step 4 }
  api_lambda -> workflow_lambda { step 5 }
  workflow_lambda -> cloudformation
  cloudformation -> fargate { from s to n }
  templates -> cloudformation { step 6 }
  ecr -> fargate { step 7 }
  appsync -> state { step 8 }
}
```

The numbered edges make the main story easy to follow: a user reaches the
public UI, the UI calls AppSync, the API starts the deployment workflow, and
the workflow launches transfer workloads. The managed account supplies the
templates and container artefacts without being flattened into the customer
account.

The complete files are available as [the `.dgm` source](../../diagrams/aws-data-transfer-hub.dgm), [the generated SVG](../../diagrams/aws-data-transfer-hub.svg), and [the detailed reference specification](../../diagrams/aws-data-transfer-hub-reference-spec.md). The last link is the reconstruction specification used to establish the reference example; the shorter architecture brief is the interpretation to read first.

## Open and review the result in Studio

When the agent is done, start Studio and open the generated `.dgm` file:

```bash
dumbdiagrams studio
```

Choose **Open**, select the source, and check the account boundaries, the two
authentication alternatives, the numbered flow, and the managed-account
artefacts. If you move a resource or pin a connector, Studio saves that visual
decision in the same portable document.

<figure>
  <img src="./rendered-result.png" alt="Studio showing the rendered diagram canvas and export controls" loading="lazy" />
  <figcaption>This capture shows the Studio result surface from the same local workflow. The open tab is the repository's separate image-thumbnail example; the cross-account source and its matching AWS render are linked below.</figcaption>
</figure>

<figure>
  <img src="../../diagrams/aws-data-transfer-hub-preview.svg" alt="Rendered cross-account AWS data transfer platform" loading="lazy" />
  <figcaption>The canonical cross-account output rendered from the source above.</figcaption>
</figure>

This is the whole loop: a natural request, a small amount of agent context,
reviewable `.dgm` source, and a deterministic rendered diagram. For the general
setup, see [the agent workflow](../agent-workflow/) and [the quick start](../quick-start/).
