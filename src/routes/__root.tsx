import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import "@/index.css";
import VConsole from "vconsole";

function NotFound() {
  return (
    <div className="p-8 text-center text-red-600">
      <h1 className="text-2xl font-bold mb-2">404 - Page Not Found</h1>
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

    return (
      <>
        <div className="p-2 flex gap-2">
          <Link to="/" className="[&.active]:font-bold">
            Home
          </Link>{" "}
          <Link to="/about" className="[&.active]:font-bold">
            About
          </Link>
        </div>
        <hr />
        <Outlet />
      </>
    );
  },
  notFoundComponent: NotFound,
});
