# Extension development

Build with current stable Node and npm. The npm lockfile records the exact
tested packages; `.npmrc` uses nested installs so typed ESLint resolves its
supported TypeScript JavaScript API. TypeScript 7 is the sole build/type-check
compiler. The private `tooling/eslint` workspace supplies TypeScript 6 only to
ESLint until that tool supports TypeScript 7's new API. Do not use
`--legacy-peer-deps`.

```sh
npm ci
npm run package
npm run test:unit
npm run lint
npm run audit:security
npx vsce package --no-dependencies
```

The extension targets the API embedded in current Kiro as well as current VS
Code. Latest VS Code typings remain locked for compilation. Optional chat/model
registration is capability guarded; absence must leave Contexts and supported
panels working. Run the synthetic optional-API regressions and real editor-host
tests when changing compatibility.

## Isolated Mac editor launches

Jest's development-only `deepmerge` dependency uses the local hardened fork in
`tooling/deepmerge` while GHSA-gcqx-w48m-w2h4 has no patched upstream release.
The fork retains the upstream API and license, but defines own data properties
instead of invoking inherited setters during destination writes. Its provenance
records the original source hash. `test:unit` runs prototype-poisoning and API
compatibility regressions before Jest. Keep the dependency security audit
enabled; remove the fork only after verifying a compatible upstream fix. The
complete tooling directory is excluded from the VSIX.

Run installed apps only from `/Applications`. Managed hosts may require approval
for copied apps, so never relocate an editor for testing.

```sh
npm run dev:editor -- --editor vscode --state-dir /tmp/xcsh-editor-test
npm run dev:editor -- --editor kiro --state-dir /tmp/xcsh-editor-test
```

The helper uses separate user-data and extension directories, inspection ports
9330/9331, and one shared `$XDG_CONFIG_HOME` under the state directory. A state
path must be short enough for macOS IPC sockets. Use a private directory or a
short alias to one. For installed-artifact acceptance, add
`--vsix /absolute/file.vsix`. Without that option it loads the source worktree
in an extension development host. Development builds include source maps;
packaging uses hidden source maps.

When the operator authorizes using their default editor profile, reuse native
sign-in in place and keep experiments in task-owned workspaces. Do not copy
native credentials or change unrelated profile settings. Keep raw evidence
private and bind each inspected window to its exact workspace and artifact.

Copy authorized canonical profiles into the task store privately before launch.
Never commit that store, editor logs, screenshots, credentials, or profile
names. Preserve original profiles and active pointers. A reloaded editor lists
persisted profiles but waits for explicit activation, matching xcsh's session
gate.

For editor-host tests, set `VSCODE_TEST_EXECUTABLE` to the installed executable
(`/Applications/Visual Studio Code.app/Contents/MacOS/Code` or
`/Applications/Kiro.app/Contents/MacOS/Kiro`), and set short private
`VSCODE_TEST_USER_DATA_DIR`, `VSCODE_TEST_EXTENSIONS_DIR`, and `XDG_CONFIG_HOME`
paths before `npm run test:integration`. `XCSH_EDITOR_API_RECEIPT` optionally
writes a private capability receipt. Native UI acceptance is a separate gate:
bind the window and process to the task state, source commit, and artifact hash
before interaction. Do not operate a pre-existing user window as a task window.

## Kiro chat

Kiro specialist delivery is gated. In Kiro 1.4.26, command arguments do not
select the primary agent, slash invocation delegates, and new sessions do not
retain a manually selected specialist. No persistent-default control was found.
The chat entrypoints report this limit without changing native sessions or
drafts. Contexts and resource views continue to work. See the sanitized
[campaign receipt](docs/development/native-chat-prototype-1708.md) for evidence.

A future Kiro route must pass the complete campaign before these entrypoints are
enabled. Native sign-in and selected models remain under editor control.

The Kiro 1.4.51 follow-up reached the native input handler through public editor
commands, but named-agent arguments and local session creation still opened
Default. Manual selector changes worked; new sessions did not retain xcsh, and
no default-setting control was found. A native language-model identity tool
worked through the editor API but was unavailable to the specialist. An
authenticated extension-host MCP identity tool worked after manual selection;
this does not qualify primary-agent routing or packaged F5 operations. See the
[version-specific receipt](docs/development/native-chat-kiro-1451-1708.json).

Kiro 1.4.51 ignores a JSON agent containing CLI-only `allowedTools` without
native `permissions`. Use the documented IDE agent schema for test fixtures.
Keep prototype configuration labels explicitly public; identity reassignment
wording was rejected by the native model in this campaign. The resource draft
and attachment survived Open input but were lost after reload, without being
submitted. Do not infer draft persistence from a command returning successfully.

## Native LiteLLM model access

VS Code can expose gateway models through its native language-model provider
API. Set `LITELLM_BASE_URL` and `LITELLM_API_KEY` in the extension-host
environment before launching the editor. Credentials remain in that environment;
they are not copied into editor settings or shared with another editor's sign-in
state. The provider registers before optional xcsh CLI startup, so CLI absence
does not remove model access. Choose the model in the native picker.

The accepted installed workflow uses the native **Local** harness. In the
signed-in test profile, set these native preferences once before testing:

```json
{
  "chat.defaultToCopilotHarness": false,
  "chat.editor.preferCopilotHarness": false
}
```

With both preferences disabled, fresh Local sessions retained xcsh, the chosen
gateway model, typed drafts and attachment chips through reload in two windows.
The extension never changes these preferences or selects the model. With the
default preferences enabled, fresh unsent sessions reset to Copilot/Auto during
reload; persisted Local conversations behaved differently. Record the native
preferences when qualifying an editor version. The new Copilot harness reset the
model to Auto in the experiment, so that workflow is excluded. The native picker
command `workbench.action.chat.openNewChatSessionInPlace.local` with the
`sidebar` argument creates Local directly. `newLocalChat` can be redirected to
Copilot by native preferences or treatments, even with an explicit Local
override. Kiro's native chat has no qualifying custom gateway route in version
1.4.26; Kiro chat delivery remains gated.

## Native F5 tool preparation

`NativeF5Tool` adapts the extracted core to native tool invocations. Each call
owns a separate `NativeContextHost` and core instance. Writes require an opaque
native request token; its private fields are never inspected. The adapter
generates an invocation identity and retains the binding, validated plan, and
exact approval within that invocation. Model input cannot reuse a plan from
another request or window. Cancellation and disposal abort active operations; a
successfully verified write retains its completion result after late
cancellation. Transport errors expose contract codes and retain their causes
privately. Mutations are never retried by the adapter.

The manifest declares the F5 tool, guarded by `xcsh.nativeF5Ready`. Activation
publishes the owned Local agent in eligible VS Code workspaces; Kiro is
excluded. Activation initializes readiness to false; successful native tool
registration exposes the agent, and disposal clears readiness. The agent file is
packaged without a model override.

The extension pins the published `@f5-sales-demo/xcsh-f5-core@23.10.1` package.
`bundledNativeF5Options` verifies its protocol and specification receipt before
creating the actual core. Native registration runs independently of CLI startup;
optional CLI queries negotiate capabilities only and receive no credential env.
Package, registration or routing failure leaves native entrypoints gated. Keep
source, prototype, installed VSIX and marketplace acceptance distinct. Native
anonymous-session resets and asynchronous agent discovery require real editor
tests, including startup, multiple windows and draft preservation.

## Native chat router preparation

`NativeChatRouter` prepares Open Panel, New Session and Attach Resource through
public editor APIs and native commands. Operations serialize within a window and
recheck cancellation, availability, the exact workspace and public window focus
after asynchronous work. Background requests stop before touching chat. New
Session initializes an empty partial query; Open Panel and attachments provide
no query. Attachment files are private, immutable JSON snapshots and survive
disposal because native drafts and history can retain their references.

An optional `prepareModels` callback must finish native model metadata discovery
before chat commands run. With the configured LiteLLM provider, query its native
vendor and reject an empty catalog; never supply a model selector in the router.
Registration preserves existing handlers and rolls back a partial conflict.
Registered routing commands return `true` on success and `false` after a
rejected operation; integration clients must check that result.

Resource delivery uses the dedicated native `workbench.action.chat.attachFile`
action after selecting and revalidating xcsh. Passing nested `attachFiles` to
the custom-agent selection command was ignored in an existing Local
conversation. An editor without the dedicated action rejects attachment before
changing chat or creating a snapshot. Native editor typing and programmatic
partial queries have different draft persistence behavior; qualify actual typing
and file chips through reload, without submitting drafts.

`ManagedWorkspaceAgent` prepares a stable `.github/agents/xcsh.agent.md` URI in
trusted, local, single-root VS Code workspaces only. Pass the packaged,
version-neutral instructions and readiness of the registered core tool. Initial
publication uses `WorkspaceEdit.createFile` with complete contents and both
`overwrite` and `ignoreIfExists` disabled. A rejected creation is inspected
once; there is no write retry. The editor API exposes creation to native
customization discovery; Node-only publication failed fresh-window discovery
until reload.

Only exact instruction bytes plus the ownership footer qualify for reuse.
Existing files, user edits and differing instruction versions are preserved and
rejected. Directories and the final file reject symlinks; verification checks
file identity, contents and the workspace after asynchronous work. Supply
`verifyAgent: token => managedAgent.verify(token)` to the router so edits or
removal stop routing before chat opens and again immediately before selection.

Disposal revokes the registration instance but retains the workspace document:
other windows and native conversation history share its URI. Revoke the native
tool's readiness separately. The workspace document persists after extension
removal. Installed-artifact checks verified that disablement and removal revoke
the tool after the editor's required reload, including removal in two windows.
Before reload, the existing extension host can still invoke the tool. Automatic
document cleanup remains excluded because conversation history can reference it.
An edited or removed document is never repaired by `verify`.

`activateXcsh` wires the published core, native adapter and managed
registration. A stable workspace URI passed prototype upgrades;
extension-version-dependent agent URIs failed. The complete production VSIX
lifecycle and released marketplace artifacts require separate evidence. See the
[installed receipt](docs/development/native-chat-installed-1708.json) for
accepted and excluded observations.

On a shared desktop, a changed window, focus, draft or model invalidates the UI
preflight. Preserve the failed capture and retry after a fresh task-window
check. Do not replay a possibly dispatched mutation: resolve its receipt and
independent API outcome first. Attachment drafts must never be submitted
automatically.
