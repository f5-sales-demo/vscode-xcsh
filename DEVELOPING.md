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
