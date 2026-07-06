import { test, expect } from "vitest";
import { Role } from "@milaboratories/pl-client";
import { canGrantToEveryone, canImpersonate } from "./sharing_model";

// canImpersonate is the admin gate for "open another user's root". It must be strictly
// stricter than canGrantToEveryone: a regular USER may share their own projects but must
// never be offered impersonation. Reusing the sharing predicate here let a regular user
// see the admin menu item (MILAB-6484 regression), so this asymmetry is pinned.

test("canImpersonate: admin and controller only", () => {
  expect(canImpersonate(Role.ADMIN)).toBe(true);
  expect(canImpersonate(Role.CONTROLLER)).toBe(true);
  expect(canImpersonate(Role.USER)).toBe(false);
  expect(canImpersonate(Role.WORKFLOW)).toBe(false);
  expect(canImpersonate(Role.UNSPECIFIED)).toBe(false);
  expect(canImpersonate(null)).toBe(false);
});

test("canGrantToEveryone and canImpersonate does not include USER", () => {
  expect(canGrantToEveryone(Role.USER)).toBe(false);
  expect(canImpersonate(Role.USER)).toBe(false);
});
