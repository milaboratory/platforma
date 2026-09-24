---
"@milaboratories/pl-middle-layer": minor
---

Sharing drops accept/reject: a share is a shelf, not an invitation

A recipient could read a share's contents from the moment it appeared, so "Accept"
never granted anything — it copied, and recorded a one-shot, irreversible decision
over a resource that stays readable. "Reject" told the donor nothing at all for
read-only and template shares, where no reply can be written onto the envelope.

A share is now simply open until it expires or is revoked, and the recipient may
copy from it any number of times. A folder can be shared as well as projects and a
template.

**Breaking:**

- `acceptShare(shareIds, rename?)` is replaced by `copyShare(shareIds, destination?)`,
  which copies into a folder of the recipient's choosing and records nothing. It
  returns `{ projects, templates, failed }`.
- `rejectShare(shareId)` is replaced by `hideShare(shareId)` and
  `unhideShare(shareId)`. Hiding is private to the recipient and reversible.
- `changeShare` is removed. A share is replaced instead: the new share names the
  prior shares it supersedes in `replace`, they are deleted in the transaction that
  creates it, and it gets a `ShareId` of its own.
- `replace` is now an optional `ShareReplaceOption` (`ShareId[]`) on every variant of
  `ShareProjectsOptions`, `ShareTemplateOptions` and `ShareFolderOptions`. It was a
  required `boolean` on the everyone variant of `ShareProjectsOptions` only, and a
  boolean no longer compiles.
- `shareProjects` returns a `ShareOutcome`, `{ shareId }`, where it returned nothing.
  `shareTemplate` returns a `ShareOutcome` too, and `ShareTemplateOutcome` is removed.
- `pendingShares` is now `availableShares`, and `PendingShare` is `AvailableShare`
  with a `hidden` flag: hidden shares are listed, not dropped, so a view can offer
  to show them.
- `OutgoingShare` loses `responses` and `responsesAvailable`, and the envelope's
  `acceptance/{login}` records are gone with them.
- Removed exports: `decisionField`, `SharingDecision`, `ProjectChangeAction`,
  `EnvelopeAcceptance`, `AcceptanceFieldPrefix`, `acceptanceField`,
  `isAcceptanceField` and `acceptanceFieldLogin`.

**Added:**

- `shareFolder(folder, options)` shares a folder and everything under it: its
  folders, a snapshot of every project in them, and every template whole. The
  recipient's copy rebuilds the subtree under the destination with ids of its own;
  only the root is renamed to be free there.
- `ShareAudience` (named recipients XOR everyone) and `ShareOptions` (the audience, the
  title and `replace`). `ShareProjectsOptions` is `ShareOptions & { mode }`, and
  `ShareTemplateOptions` and `ShareFolderOptions` are `ShareOptions`. `ShareOutcome`
  is what every share method returns.
- The hidden-share API: `HiddenFieldPrefix`, `hiddenField`, `isHiddenField`,
  `hiddenFieldShareId`, which returns a `ShareId`, and `ShareHidden`.
- The folder payload: the `folder` kind of `EnvelopePayload`, `EnvelopeFolderId`,
  `newEnvelopeFolderId`, `EnvelopeFolder`, `EnvelopeFolderProject`, `EnvelopeFolderTemplate`,
  `envelopeFolderRoot` and `EnvelopeFolderSummary`.
- `newProjectFieldUuid`, which mints the key of one project snapshot in an envelope.
- `OutgoingShare.folder`, `OutgoingShare.description` and `OutgoingShare.template.source`,
  the donor's own template id that a template's prior shares are matched on;
  `AvailableShare.folder` and `AvailableShare.description`.
- Envelope entries carry descriptions: a project snapshot its project's
  `description`, and a template payload its `description` and `source`. All three are
  optional, and envelopes written before them carry none.

What a copy does:

- Names are chosen against the destination folder, the scope the uniqueness rule
  actually has, replacing the global dedupe accept used.
- A destination folder deleted meanwhile puts that share in `failed`, whatever it
  carries, rather than spilling the copy at the top level.
- When the recipient's folder document cannot be rewritten by this build, the copies
  are still made and land at the top level, and a shared folder's subtree is not
  rebuilt.

Compatibility:

- `SharingState` keeps its `decision/{shareId}` field name, now written to mean
  "hidden" and removed to unhide. Records written by an older build read as hidden,
  whether they said accepted or rejected: either way that user has already dealt
  with the share and does not want it back in their list.
- A build that predates the folder payload kind does not list a folder share at all.
