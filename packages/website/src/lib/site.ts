export const sections = ["Start here", "Make diagrams", "How it works", "Reference"] as const;
export function orderDocs<T extends { id: string; data: { section: string; order: number } }>(docs: T[]): T[] {
  return [...docs].sort((a, b) => {
    const sectionDifference =
      sections.indexOf(a.data.section as (typeof sections)[number]) -
      sections.indexOf(b.data.section as (typeof sections)[number]);
    return sectionDifference || a.data.order - b.data.order || a.id.localeCompare(b.id);
  });
}
export const createCommand = "npm install -g create-dumb-diagrams";
export const installCommand = "dumbdiagrams init";
export const repository = import.meta.env.PUBLIC_REPOSITORY_URL || "";
export const npmUrl = "https://www.npmjs.com/package/create-dumb-diagrams";
export function url(path = "") {
  return `${import.meta.env.BASE_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}
