/**
 * ============================================================
 *  MODULE INDEX — RF Gun Seed Data: Warehouse Employees
 * ============================================================
 *
 *  Purpose: Seed employee records for the Employee Master and
 *           RF Gun badge authentication. These are the demo
 *           accounts that floor staff use to log into RF Guns.
 *
 *  Seed accounts:
 *    WH-1001  Jordan Avery    Admin            ALL
 *    WH-1002  Devon Hill      Operations Mgr   ATL1
 *    WH-1003  Sara Owens      Warehouse Lead   ORD2
 *    WH-1004  Marcus Reid     Warehouse Lead   LAX3
 *    WH-1005  Anya Volkov     Receiver         EWR1
 *    WH-1006  Riley Park      Picker           ATL1
 *    WH-1007  Tomás Ruiz      Billing          ALL
 *
 *  Extension points:
 *    - Import from CSV during onboarding
 *    - Add biometric badge ID support
 *    - Add shift/schedule tracking
 * ============================================================
 */

import type { WarehouseEmployee } from "./rf-types";

export const employees: WarehouseEmployee[] = [
  {
    badgeId: "WH-1001",
    name: "Jordan Avery",
    email: "jordan.avery@azux.com",
    assignedClientId: "all",
    assignedWarehouseId: "all",
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    badgeId: "WH-1002",
    name: "Devon Hill",
    email: "devon.hill@azux.com",
    assignedClientId: "acme",
    assignedWarehouseId: "atl1",
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    badgeId: "WH-1003",
    name: "Sara Owens",
    email: "sara.owens@azux.com",
    assignedClientId: "northstar",
    assignedWarehouseId: "ord2",
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    badgeId: "WH-1004",
    name: "Marcus Reid",
    email: "marcus.reid@azux.com",
    assignedClientId: "northstar",
    assignedWarehouseId: "lax3",
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    badgeId: "WH-1005",
    name: "Anya Volkov",
    email: "anya.volkov@azux.com",
    assignedClientId: "harborlite",
    assignedWarehouseId: "ewr1",
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    badgeId: "WH-1006",
    name: "Riley Park",
    email: "riley.park@azux.com",
    assignedClientId: "acme",
    assignedWarehouseId: "atl1",
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    badgeId: "WH-1007",
    name: "Tomas Ruiz",
    email: "tomas.ruiz@azux.com",
    assignedClientId: "verdant",
    assignedWarehouseId: "atl1",
    isActive: true,
    createdAt: new Date().toISOString(),
  },
];
