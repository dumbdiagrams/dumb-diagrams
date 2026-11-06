import { parseDgmResult } from "@dumb-diagrams/runtime/dsl";

export interface DiagramExample {
  id: string;
  title: string;
  description: string;
  tags: string[];
  source: string;
  prompt: string;
  /** The normalized interpretation shown in Studio, when available. */
  architectureBrief?: string;
}

const files = import.meta.glob<string>(
  "../../../examples/approved/*/*/{diagram.dgm,user-prompt.md,architecture-brief.md}",
  { query: "?raw", import: "default", eager: true },
);

const manifests = import.meta.glob<{ featured?: boolean }>("../../../examples/approved/*/manifest.json", {
  import: "default",
  eager: true,
});
const featured = Object.keys(manifests)
  .filter((path) => manifests[path]!.featured)
  .map((path) => path.slice(0, -"manifest.json".length));

const PROVIDERS: Record<string, string> = {
  aws: "AWS",
  azure: "Azure",
  gcp: "GCP",
  "cloud-agnostic": "Cloud-agnostic",
};
const DIFFICULTIES = ["easy", "medium", "hard"];

/** The featured approved run, one card per prompt, ordered by provider then difficulty. */
export const DIAGRAM_EXAMPLES: DiagramExample[] = Object.keys(files)
  .filter((path) => path.endsWith("/diagram.dgm") && featured.some((run) => path.startsWith(run)))
  .map((path): DiagramExample & { order: number } => {
    const bundle = path.slice(0, -"/diagram.dgm".length);
    const id = bundle.slice(bundle.lastIndexOf("/") + 1);
    const provider = Object.keys(PROVIDERS).find((key) => id.startsWith(`${key}-`))!;
    const difficulty = id.slice(provider.length + 1).split("-")[0]!;
    const source = files[path]!;
    const prompt = files[`${bundle}/user-prompt.md`]!.replace(/^# .*\n+/, "").trim();
    return {
      id,
      title:
        parseDgmResult(source)
          .map((doc) => doc.title)
          .unwrapOr(undefined) ?? id,
      description: prompt.split(/(?<=\.)\s/)[0]!,
      tags: [PROVIDERS[provider]!, difficulty],
      source,
      prompt,
      architectureBrief: files[`${bundle}/architecture-brief.md`],
      order: Object.keys(PROVIDERS).indexOf(provider) * 10 + DIFFICULTIES.indexOf(difficulty),
    };
  })
  .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
  .map(({ order: _order, ...example }) => example);
