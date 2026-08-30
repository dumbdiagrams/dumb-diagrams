import { describe, expect, it } from "vitest";

import { browserLaunchCommand } from "./platform-launch.js";

describe("browserLaunchCommand", () => {
  const url = "http://127.0.0.1:4788/a path?x=1&y=2";

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
