import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { WalletProvider } from "@/wallets/provider/WalletProvider";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

// Create a new router instance
const basepath = import.meta.env.VITE_APP_BASE || "";

const router = createRouter({
  routeTree,
  basepath,
});

// Render the app
const rootElement = document.getElementById("root")!;
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <WalletProvider>
        <RouterProvider router={router} />
      </WalletProvider>
    </StrictMode>
  );
}
