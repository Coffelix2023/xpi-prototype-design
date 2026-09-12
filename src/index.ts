import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const VERSION = "0.1.0";

export default function xpiPrototypeDesign(pi: ExtensionAPI): void {
  pi.registerCommand("xpi-prototype-design", {
    description: "Show xpi-prototype-design status",
    handler: async (_args, ctx) => {
      ctx.ui.notify(`xpi-prototype-design ${VERSION} loaded`);
    },
  });
}
