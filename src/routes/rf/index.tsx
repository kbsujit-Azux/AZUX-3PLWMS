// @ts-nocheck
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RFSessionProvider } from "@/lib/rf-session";
import { RfShell } from "./rf-shell";

export const Route = createFileRoute("/rf")({
  component: function RfLayout() {
    return (
      <RFSessionProvider>
        <RfShell>
          <Outlet />
        </RfShell>
      </RFSessionProvider>
    );
  },
});
