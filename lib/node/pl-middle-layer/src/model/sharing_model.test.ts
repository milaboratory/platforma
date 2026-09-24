import { test, expect } from "vitest";
import { Role } from "@milaboratories/pl-client";
import {
  canGrantToEveryone,
  canImpersonate,
  decodeEnvelopeData,
  EnvelopeSchemaVersionCurrent,
  envelopeProjectMap,
  normalizeEnvelopeData,
} from "./sharing_model";

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

//
// Envelope decode — the recognise-or-hide gate every reader of a share passes through.
//
// Pure by construction: the gate is a function of the blob, and the three sites that
// discover envelopes (the pending view, the live-envelope view the accept flow reads,
// and the donor's own outbox) all skip an envelope this returns `undefined` for. So an
// envelope that does not decode cannot be offered, accepted, or listed.

/** A v1 envelope, exactly as one written before the payload discriminant existed: the
 *  project map sits at the top level and there is no `payload` field. */
const v1Envelope = {
  schemaVersion: 1,
  shareId: "5d1a6f6c-2b6e-4a3f-9c2d-8f0e1b7a4c55",
  sharedAt: 1_700_000_000_000,
  expiresAt: null,
  mode: "copy",
  sender: "donor",
  title: "Two projects",
  projects: {
    "9c7e4d10-2b83-4f6a-91d5-7e0c3a8b5f42": {
      label: "Project 1",
      source: "42",
      updatedAt: 1_700_000_000_000,
    },
  },
};

const blob = (envelope: unknown) => Buffer.from(JSON.stringify(envelope), "utf-8");

test("a v1 envelope still decodes, and reads as a share of projects", () => {
  const data = decodeEnvelopeData(blob(v1Envelope));

  // Upcast on read: past the decode nothing knows two shapes ever existed.
  expect(data?.schemaVersion).toBe(EnvelopeSchemaVersionCurrent);
  expect(data?.payload).toStrictEqual({ kind: "projects", projects: v1Envelope.projects });
  expect(envelopeProjectMap(data!)).toStrictEqual(v1Envelope.projects);

  // Everything a view renders survives the upcast unchanged.
  expect(data).toMatchObject({
    shareId: v1Envelope.shareId,
    sharedAt: v1Envelope.sharedAt,
    expiresAt: null,
    mode: "copy",
    sender: "donor",
    title: "Two projects",
  });
});

test("a current envelope carrying a template decodes as one", () => {
  const data = decodeEnvelopeData(
    blob({
      ...v1Envelope,
      schemaVersion: EnvelopeSchemaVersionCurrent,
      projects: undefined,
      payload: {
        kind: "template",
        document: { schema: "template-v1", blocks: [] },
        label: "A pipeline",
        from: "donor",
      },
    }),
  );

  expect(data?.payload).toStrictEqual({
    kind: "template",
    document: { schema: "template-v1", blocks: [] },
    label: "A pipeline",
    from: "donor",
  });
  // A template payload carries no project snapshot, so a project-shaped reader sees nothing
  // rather than something it would then try to copy.
  expect(envelopeProjectMap(data!)).toStrictEqual({});
});

test("an envelope whose payload kind this build does not know does not decode at all", () => {
  // The whole point of the discriminant: a share this build cannot act on is hidden rather
  // than offered, and the decode is where that is decided — once, for every reader.
  expect(
    decodeEnvelopeData(
      blob({
        ...v1Envelope,
        schemaVersion: EnvelopeSchemaVersionCurrent,
        projects: undefined,
        payload: { kind: "workspace", whatever: true },
      }),
    ),
  ).toBeUndefined();
});

test("an envelope from a newer schema does not decode either", () => {
  expect(
    decodeEnvelopeData(blob({ ...v1Envelope, schemaVersion: EnvelopeSchemaVersionCurrent + 1 })),
  ).toBeUndefined();
});

test("a v1 envelope with no project map at all does not decode", () => {
  // There is no payload to reconstruct: a v1 blob without `projects` describes nothing,
  // which is not the same as describing an empty pack.
  expect(decodeEnvelopeData(blob({ ...v1Envelope, projects: undefined }))).toBeUndefined();
});

test("anything that is not an envelope object does not decode", () => {
  expect(normalizeEnvelopeData(null)).toBeUndefined();
  expect(normalizeEnvelopeData("an envelope")).toBeUndefined();
  expect(normalizeEnvelopeData(42)).toBeUndefined();
});
