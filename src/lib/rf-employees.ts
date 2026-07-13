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
    passwordHash: "a3558c02f2483fe4598698057990faabf3447f5500b863269fb3432e1261052a",
    role: "Admin",
    team: "All",
    shift: "A",
  },
  {
    badgeId: "WH-1002",
    name: "Devon Hill",
    email: "devon.hill@azux.com",
    assignedClientId: "acme",
    assignedWarehouseId: "atl1",
    isActive: true,
    createdAt: new Date().toISOString(),
    passwordHash: "6b40a76a260e025828e88ecd922004a93b1a1c422d2d90ef89b87422179680bc",
    role: "Operations Manager",
    team: "Operations",
    shift: "A",
  },
  {
    badgeId: "WH-1003",
    name: "Sara Owens",
    email: "sara.owens@azux.com",
    assignedClientId: "northstar",
    assignedWarehouseId: "ord2",
    isActive: true,
    createdAt: new Date().toISOString(),
    passwordHash: "9b852d37a4a30b5750511e023d50c336424ff358572adfe6939ff9e4e89b1e9e",
    role: "Warehouse Lead",
    team: "Putaway",
    shift: "A",
  },
  {
    badgeId: "WH-1004",
    name: "Marcus Reid",
    email: "marcus.reid@azux.com",
    assignedClientId: "northstar",
    assignedWarehouseId: "lax3",
    isActive: true,
    createdAt: new Date().toISOString(),
    passwordHash: "9b852d37a4a30b5750511e023d50c336424ff358572adfe6939ff9e4e89b1e9e",
    role: "Warehouse Lead",
    team: "Move",
    shift: "B",
  },
  {
    badgeId: "WH-1005",
    name: "Anya Volkov",
    email: "anya.volkov@azux.com",
    assignedClientId: "harborlite",
    assignedWarehouseId: "ewr1",
    isActive: true,
    createdAt: new Date().toISOString(),
    passwordHash: "6d0ff6f95ffd82b6af1a27c7acb869a291b3df24b654ef2d3181f1f0152fa7cf",
    role: "Receiver",
    team: "Receiving",
    shift: "A",
  },
  {
    badgeId: "WH-1006",
    name: "Riley Park",
    email: "riley.park@azux.com",
    assignedClientId: "acme",
    assignedWarehouseId: "atl1",
    isActive: true,
    createdAt: new Date().toISOString(),
    passwordHash: "8643005c351ad4a2c2128c5967ad13bc87a17f293ebad4cc44b4543832a21979",
    role: "Picker",
    team: "Picking",
    shift: "B",
  },
  {
    badgeId: "WH-1007",
    name: "Tomas Ruiz",
    email: "tomas.ruiz@azux.com",
    assignedClientId: "verdant",
    assignedWarehouseId: "atl1",
    isActive: true,
    createdAt: new Date().toISOString(),
    passwordHash: "efc09ad7e7bfe1808c05b91d4672fe334b3576a3e3486057f560b1a405977503",
    role: "Billing",
    team: "Admin",
    shift: "A",
  },
];
