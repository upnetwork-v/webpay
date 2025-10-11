import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const base = mode === "test" ? "/webpay/" : "/";
  return {
    base,
    define: {
      "import.meta.env.VITE_APP_BASE": JSON.stringify(base),
      global: "globalThis",
    },
    resolve: {
      alias: {
        "@": "/src",
      },
    },
    optimizeDeps: {
      include: [
        "@walletconnect/sign-client",
        "@walletconnect/types",
        "@walletconnect/utils",
      ],
    },
    build: {
      commonjsOptions: {
        include: [/node_modules/],
        transformMixedEsModules: true,
      },
      rollupOptions: {
        external: [],
        output: {
          manualChunks: {
            walletconnect: [
              "@walletconnect/sign-client",
              "@walletconnect/types",
              "@walletconnect/utils",
            ],
          },
        },
      },
    },
    plugins: [
      nodePolyfills(),
      TanStackRouterVite({ target: "react", autoCodeSplitting: true }),
      react(),
      tailwindcss(),
    ],
  };
});
