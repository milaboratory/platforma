import { Flags } from "@oclif/core";

export const GlobalFlags = {
  address: Flags.string({
    char: "a",
    summary: "Platforma server address",
    helpValue: "<url>",
    env: "PL_ADDRESS",
    required: true,
  }),
  format: Flags.string({
    char: "f",
    summary: "Output format",
    options: ["text", "json"],
    default: "text",
  }),
};

export const UserAuthFlags = {
  user: Flags.string({
    char: "u",
    summary: "Username for authentication",
    env: "PL_USER",
  }),
  password: Flags.string({
    char: "p",
    summary: "Password for authentication",
    env: "PL_PASSWORD",
  }),
};

/** Admin credentials only (for purely admin commands like copy-project). */
export const AdminAuthFlags = {
  "admin-user": Flags.string({
    summary: "Admin/controller username",
    env: "PL_ADMIN_USER",
    required: true,
  }),
  "admin-password": Flags.string({
    summary: "Admin/controller password",
    env: "PL_ADMIN_PASSWORD",
    required: true,
  }),
};

/** Admin credentials + target user (for regular commands that can optionally operate on another user). */
export const AdminTargetFlags = {
  "admin-user": Flags.string({
    summary: "Admin/controller username (enables admin mode)",
    env: "PL_ADMIN_USER",
  }),
  "admin-password": Flags.string({
    summary: "Admin/controller password",
    env: "PL_ADMIN_PASSWORD",
  }),
  "target-user": Flags.string({
    summary: "Operate on this user's data (requires admin credentials)",
    env: "PL_TARGET_USER",
  }),
};
