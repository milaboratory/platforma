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
