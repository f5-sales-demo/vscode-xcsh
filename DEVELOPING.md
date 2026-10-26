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

## Native LiteLLM model access

VS Code can expose gateway models through its native language-model provider
API. Set `LITELLM_BASE_URL` and `LITELLM_API_KEY` in the extension-host
environment before launching the editor. Credentials remain in that environment;
they are not copied into editor settings or shared with another editor's sign-in
state. The provider registers before optional xcsh CLI startup, so CLI absence
does not remove model access. Choose the model in the native picker.

The current accepted prototype uses the native **Local** harness. The new
Copilot harness reset the model to Auto in the experiment, so that workflow is
excluded. Use the supported New Local Chat command for further routing tests.
Kiro's native chat has no qualifying custom gateway route in version 1.4.26;
Kiro chat delivery remains gated.

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

The manifest declares the F5 tool and a Local-only custom agent. Both
declarations are guarded by `xcsh.nativeF5Ready` and excluded from Kiro.
Activation initializes readiness to false; successful native tool registration
exposes the agent, and disposal clears readiness. The agent file is packaged
without a model override.

The package boundary remains structural until the accepted shared package is
published and pinned. Its actual public declarations have been checked against
this factory, and private prototypes exercise the real core. Production does not
yet register the core tool, so the declarations remain unavailable. Do not add a
private filesystem dependency or treat prototype results as marketplace-only
acceptance. Native anonymous-session resets and asynchronous agent discovery are
separate routing considerations. Full startup, multiple-window and draft
preservation acceptance remain required before enabling the production route.
