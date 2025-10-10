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
        "@walletconnect/web3-provider",
        "@walletconnect/client",
        "@walletconnect/qrcode-modal",
        "web3",
        "web3modal",
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
              "@walletconnect/web3-provider",
              "@walletconnect/client",
              "@walletconnect/qrcode-modal",
            ],
            web3: ["web3", "web3modal"],
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
