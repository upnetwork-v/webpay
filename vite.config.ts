import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import inject from "@rollup/plugin-inject";
import { fileURLToPath } from "url";
import { dirname, resolve as pathResolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  base: "/MerchantConnectFrontend/",
  resolve: {
    alias: {
      "@": "/src",
      buffer: "buffer",
      "@solana/web3.js": pathResolve(
        __dirname,
        "node_modules/@solana/web3.js/lib/index.cjs.js"
      ),
      "@solana/buffer-layout": pathResolve(
        __dirname,
        "node_modules/@solana/buffer-layout/lib/Layout.js"
      ),
      "@solana/buffer-layout-utils": pathResolve(
        __dirname,
        "node_modules/@solana/buffer-layout-utils/lib/cjs/index.js"
      ),
      "bigint-buffer": pathResolve(
        __dirname,
        "node_modules/bigint-buffer/dist/node.js"
      ),
      borsh: pathResolve(__dirname, "node_modules/borsh/lib/index.js"),
    },
  },
  build: {
    rollupOptions: {
      external: ["jsesc"],
    },
    commonjsOptions: {
      include: [/node_modules/],
    },
  },
  optimizeDeps: {
    include: [
      "jsesc",
      "@solana/web3.js",
      "tweetnacl",
      "tweetnacl-util",
      "bigint-buffer",
      "@solana/buffer-layout",
      "@solana/buffer-layout-utils",
      "borsh",
    ],
    esbuildOptions: {
      target: "esnext",
    },
  },
  define: {
    "global.Buffer": "Buffer",
  },
  plugins: [
    inject({
      Buffer: ["buffer", "Buffer"],
    }),
    TanStackRouterVite({
      target: "react",
      autoCodeSplitting: true,
    }),
    react({
      jsxRuntime: "automatic",
    }),
    tailwindcss(),
  ],
});
