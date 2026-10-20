import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { routeTree } from "./routeTree.gen";

/**
 * Route-level error boundary.
 *
 * Without this, a render error inside a screen (for example a missing record
 * in a master-data collection) unmounts the whole application and leaves the
 * user staring at a blank page with a raw stack trace. This renders a
 * recoverable panel instead and lets the user retry the screen.
 */
function RouteErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <AlertTriangle className="h-12 w-12 text-destructive" />
      <h2 className="text-lg font-semibold">This screen could not be displayed</h2>
      <p className="max-w-md text-xs text-muted-foreground">
        {error?.message || "An unexpected error occurred while rendering this screen."}
      </p>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => reset()}>
        <RefreshCcw className="h-3.5 w-3.5" /> Try again
      </Button>
    </div>
  );
}

export const getRouter = (queryClient: QueryClient) => {
  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: RouteErrorFallback,
  });

  return router;
};
