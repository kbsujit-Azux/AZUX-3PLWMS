import { describe, it, expect } from "vitest";
import { ROLE_ROUTES, can } from "@/lib/auth";

describe("Auth Authority", () => {
  it("Admin can access all routes", () => {
    const adminRoutes = ROLE_ROUTES["Admin"];
    expect(adminRoutes).toContain("/");
    expect(adminRoutes).toContain("/settings");
    expect(adminRoutes).toContain("/billing");
    expect(adminRoutes.length).toBeGreaterThan(20);
  });

  it("Viewer has restricted access", () => {
    const viewerRoutes = ROLE_ROUTES["Viewer"];
    expect(viewerRoutes).toEqual(["/", "/inventory"]);
  });

  it("Billing can access billing and tenant portal", () => {
    const billingRoutes = ROLE_ROUTES["Billing"];
    expect(billingRoutes).toContain("/billing");
    expect(billingRoutes).toContain("/tenant-portal/");
    expect(billingRoutes).toContain("/rma/");
  });

  it("all roles include root route", () => {
    Object.entries(ROLE_ROUTES).forEach(([_role, routes]) => {
      expect(routes).toContain("/");
    });
  });
});
