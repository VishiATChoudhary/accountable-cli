import path from "node:path";
import { Config } from "@remotion/cli/config";
import { enableTailwind } from "@remotion/tailwind-v4";

// "@/" for snapcn components (Remotion's bundler ignores tsconfig paths), and ".js"
// specifiers in the shared freebies sources resolve to their .ts files.
Config.overrideWebpackConfig((config) => {
  const c = enableTailwind(config);
  return {
    ...c,
    resolve: {
      ...c.resolve,
      alias: { ...c.resolve?.alias, "@": path.join(process.cwd(), "src") },
      extensionAlias: { ".js": [".ts", ".tsx", ".js"] },
    },
  };
});
