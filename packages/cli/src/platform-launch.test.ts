import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { browserLaunchCommand, launchBrowser } from "./platform-launch.js";

const url = "http://127.0.0.1:4788/a path?x=1&y=2";

describe("browserLaunchCommand", () => {
  it("uses macOS open without shell interpolation", () => {
    expect(browserLaunchCommand("darwin", url)).toEqual({ command: "open", args: [url] });
  });

  it("uses the Windows start command with the required empty title", () => {
    expect(browserLaunchCommand("win32", url)).toEqual({
      command: "cmd",
      args: ["/c", "start", "", url],
    });
  });

  it("uses xdg-open on Linux", () => {
    expect(browserLaunchCommand("linux", url)).toEqual({ command: "xdg-open", args: [url] });
  });
});

describe("launchBrowser", () => {
  it("warns when the platform launcher emits an error and still detaches", () => {
    const child = new EventEmitter() as EventEmitter & { unref: () => void };
    const unref = vi.fn();
    child.unref = unref;
    const spawnProcess = (command: string, args: string[], options: { detached: true; stdio: "ignore" }) => {
      expect({ command, args, options }).toEqual({
        command: "xdg-open",
        args: [url],
        options: { detached: true, stdio: "ignore" },
      });
      return child;
    };
    const warn = vi.fn();

    launchBrowser(url, "linux", spawnProcess, warn);
    child.emit("error", new Error("ENOENT"));

    expect(unref).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(`Unable to open a browser automatically; open ${url} manually.`);
  });

  it("warns when spawning the platform launcher throws", () => {
    const warn = vi.fn();
    launchBrowser(
      url,
      "linux",
      () => {
        throw new Error("ENOENT");
      },
      warn,
    );

    expect(warn).toHaveBeenCalledWith(`Unable to open a browser automatically; open ${url} manually.`);
  });
});
