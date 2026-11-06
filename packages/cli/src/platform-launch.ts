import { spawn as defaultSpawn } from "node:child_process";

export interface LaunchCommand {
  command: string;
  args: string[];
}

export interface BrowserLauncherProcess {
  once(event: "error", listener: () => void): BrowserLauncherProcess;
  unref(): void;
}

export type BrowserLauncherSpawn = (
  command: string,
  args: string[],
  options: { detached: true; stdio: "ignore" },
) => BrowserLauncherProcess;

const spawnProcess: BrowserLauncherSpawn = defaultSpawn;

/** Keep OS-specific launch syntax pure so every supported platform is tested in CI. */
export function browserLaunchCommand(platform: NodeJS.Platform, url: string): LaunchCommand {
  if (platform === "darwin") return { command: "open", args: [url] };
  if (platform === "win32") return { command: "cmd", args: ["/c", "start", "", url] };
  return { command: "xdg-open", args: [url] };
}

/** Launch the browser without allowing an unavailable OS helper to crash Studio. */
export function launchBrowser(
  url: string,
  platform: NodeJS.Platform = process.platform,
  spawn: BrowserLauncherSpawn = spawnProcess,
  warn: (message: string) => void = console.warn,
): void {
  const { command, args } = browserLaunchCommand(platform, url);
  const warning = () => warn(`Unable to open a browser automatically; open ${url} manually.`);

  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.once("error", warning);
    child.unref();
  } catch {
    warning();
  }
}
