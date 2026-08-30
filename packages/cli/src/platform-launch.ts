export interface LaunchCommand {
  command: string;
  args: string[];
}

/** Keep OS-specific launch syntax pure so every supported platform is tested in CI. */
export function browserLaunchCommand(platform: NodeJS.Platform, url: string): LaunchCommand {
  if (platform === "darwin") return { command: "open", args: [url] };
  if (platform === "win32") return { command: "cmd", args: ["/c", "start", "", url] };
  return { command: "xdg-open", args: [url] };
}
