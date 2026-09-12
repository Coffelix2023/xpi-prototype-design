/**
 * preview — 用**用户的系统默认浏览器**打开产物。
 *
 * 与 xpi-visualoop 的分工：这里只负责"让用户看见"，走平台原生打开命令，
 * 不启动受控浏览器、不建 CDP 会话。像素级评审交给 xpi-visualoop。
 */

import { spawn } from "node:child_process";
import { resolve } from "node:path";

export type PreviewStatus = "opened" | "unavailable" | "failed";

export interface PreviewResult {
  diagnostic?: string;
  path: string;
  status: PreviewStatus;
}

export type PreviewLauncher = (
  command: string,
  args: readonly string[],
) => Promise<void>;

export interface PreviewOptions {
  launch?: PreviewLauncher;
  platform?: NodeJS.Platform;
}

interface NativeCommand {
  args: string[];
  command: string;
}

function nativeCommand(
  platform: NodeJS.Platform,
  path: string,
): NativeCommand | undefined {
  if (platform === "darwin")
    return {
      command: "open",
      args: [
        path,
      ],
    };
  if (platform === "linux")
    return {
      command: "xdg-open",
      args: [
        path,
      ],
    };
  if (platform === "win32") {
    return {
      command: "cmd.exe",
      args: [
        "/d",
        "/c",
        "start",
        "",
        path,
      ],
    };
  }
  return undefined;
}

const launchNative: PreviewLauncher = (command, args) =>
  new Promise((settle, fail) => {
    const child = spawn(
      command,
      [
        ...args,
      ],
      {
        detached: true,
        stdio: "ignore",
      },
    );
    let settled = false;
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      fail(error);
    });
    child.once("spawn", () => {
      if (settled) return;
      settled = true;
      child.unref();
      settle();
    });
  });

export async function openInSystemBrowser(
  filePath: string,
  options: PreviewOptions = {},
): Promise<PreviewResult> {
  const path = resolve(filePath);
  const platform = options.platform ?? process.platform;
  const command = nativeCommand(platform, path);
  if (!command) {
    return {
      diagnostic: `Unsupported platform: ${platform}`,
      path,
      status: "unavailable",
    };
  }
  try {
    await (options.launch ?? launchNative)(command.command, command.args);
    return {
      path,
      status: "opened",
    };
  } catch (error) {
    return {
      diagnostic: (error as Error).message,
      path,
      status: "failed",
    };
  }
}
