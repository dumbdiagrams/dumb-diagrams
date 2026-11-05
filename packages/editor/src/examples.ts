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

const PROVIDERS: Record<string, string> = {
  aws: "AWS",
  azure: "Azure",
  gcp: "GCP",
  "cloud-agnostic": "Cloud-agnostic",
};
const DIFFICULTIES = ["easy", "medium", "hard"];

/** Approved model runs, one card per prompt, ordered by provider then difficulty. */
// ponytail: ids are bundle names, so a second approved run of the same prompts
// would duplicate cards; prefix ids with the run folder when that happens.
export const DIAGRAM_EXAMPLES: DiagramExample[] = Object.keys(files)
  .filter((path) => path.endsWith("/diagram.dgm"))
  .map((path): DiagramExample & { order: number } => {
    const bundle = path.slice(0, -"/diagram.dgm".length);
    const id = bundle.slice(bundle.lastIndexOf("/") + 1);
    const provider = Object.keys(PROVIDERS).find((key) => id.startsWith(`${key}-`))!;
    const difficulty = id.slice(provider.length + 1).split("-")[0]!;
    const source = files[path]!;
    const prompt = files[`${bundle}/user-prompt.md`]!.replace(/^# .*\n+/, "").trim();
    return {
      id,
      title: source.match(/^\s*title "([^"]+)"/m)?.[1] ?? id,
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
