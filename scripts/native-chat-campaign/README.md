# Native chat selection campaign

This development fixture measures primary-agent selection and tool transport. It
never serves F5 operations and is excluded from the production VSIX by
`scripts/**` in `.vscodeignore`. Identity-tool success cannot establish packaged
core or release acceptance. Track delivery in vscode-xcsh #1708 and xcsh #5072.

Run the gate and transport regressions:

```sh
node --test scripts/native-chat-campaign/campaign.test.mjs
```

Prepare a **new** short private directory, then launch the default-installed
editor. Preparation rejects an existing path; it does not copy credentials,
change models, or modify an application installation.

```sh
node scripts/native-chat-campaign/campaign.mjs prepare /tmp/xcsh-native-experiment
node scripts/native-chat-campaign/campaign.mjs launch /tmp/xcsh-native-experiment kiro a 9631 9632
```

Two workspace agents, `xcsh` and `xcsh-control`, have distinct instruction
markers and no model field. The fixture registers one native language-model
identity tool. `xcsh Prototype: openPanel`, `newSession`, `arguments`, and
`attachDraft` exercise native commands from the extension host. They never
submit. `arguments` passes all three selection arguments through to the actual
input path. Record the native conversation ID, primary mode, selected model,
draft, and tool receipt separately.

Run candidates in this order:

1. Native command arguments, including the full command-to-input path.
2. `/xcsh` as a draft, then an explicitly submitted synthetic identity request
   in a separate fresh conversation. Record delegation separately from primary
   agent selection.
3. Session configuration through a documented command or public extension
   interface bound to that native session. Inspector access can diagnose the
   native selector but cannot qualify as an integration route. Do not retrieve
   native endpoint authentication tokens or launch a separate ACP/CLI session as
   a replacement for the native editor session.
4. Choose `xcsh` in the documented native selector and set it as the default
   only if that control is available. Compare UI-created and extension-created
   sessions, existing non-xcsh conversations, reload, restart, and another
   window. Repeated manual selection fails the default route.
5. Ask the selected primary agent to call the native identity tool. If native
   transport fails, change the task store's `campaign.json` transport from
   `native` to `mcp`, then reload the task window. This distinct transport
   candidate starts an authenticated, ephemeral loopback Streamable HTTP
   endpoint inside the extension host. Agent registrations are updated only when
   their ownership hash still matches. User edits produce a private
   `registration-conflict` receipt. Each workspace receives its own endpoint;
   tokens stay in private task files and are never recorded in events.

For each viable candidate, capture Open Panel, New Session, attachment drafts,
existing non-xcsh conversations, cancellation, reload, model preservation, and
multiple windows. **Never submit an attachment test.** Native prompt insertion
can append to an existing draft: identity and slash submissions must use a
separate fresh conversation and a verified empty draft. Preserve contaminated or
failed captures and exclude them from acceptance. Wait for task-window startup
before observation; successful CLI exit is not editor acceptance.

Inspectors are optional diagnostic tooling for this development fixture. Bind
them to the task user-data directory and exact editor process before use. Do not
interact with a pre-existing user window. Preserve original profiles,
application installations, and failed evidence. Close only verified task windows
after capture, retaining their private stores. A second development launch may
reload an existing development window; verify actual window and workspace
identity rather than counting CLI launches.

`assessCandidate` rejects missing routing evidence, delegation, debugger
dependencies, repeated manual selection, model changes, submitted attachment
drafts, and calls after cancellation. `chooseRoute` evaluates automatic routing
before the native default and always retains the separate packaged-core and
release gates.

Production delivery additionally needs the actual shared specification-backed
core, exact plan/context/revision approvals, CLI capability negotiation,
Contexts regressions, complete suites and packaging checks, editor acceptance in
both products, and released-artifact acceptance. No fixture result closes those
gates.
