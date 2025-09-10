import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import "@/index.css";
import VConsole from "vconsole";
import { useAuthInitialization } from "@/hooks";
import KYCModal from "@/components/KYCModal";

function NotFound() {
  return (
    <div className="text-center p-8 text-red-600">
      <h1 className="font-bold mb-2 text-2xl">404 - Page Not Found</h1>
      <p className="mb-4">
        Sorry, the page you are looking for does not exist.
      </p>
      <Link to="/" className="text-blue-600 underline">
        Go Home
      </Link>
    </div>
  );
}

export const Route = createRootRoute({
  component: () => {
    new VConsole();

    // Initialize auth store when app starts
    useAuthInitialization();

    return (
      <>
        <Outlet />
        <KYCModal />
      </>
    );
  },
  notFoundComponent: NotFound,
});
