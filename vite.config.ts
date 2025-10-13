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
    },
    resolve: {
      alias: {
        "@": "/src",
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
