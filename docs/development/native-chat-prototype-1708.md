# Native chat prototype receipt — issue 1708

Captured 2026-10-25 with default-installed Kiro 1.4.26, application commit
`9b769672d19454658b99a5875a0db99f559c4c59`, embedded VS Code API 1.131.0. All
agents, workspaces, application data, tools and raw captures were task-owned.
Native authentication remained under editor control; no native credentials were
read or transferred, and no model override or application patch was used.

| Candidate             | Evidence                                                                                                                        | Classification                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Command arguments     | Draft inserted; agent, agentId and modeId left the primary mode on Default.                                                     | Failed selection                             |
| Slash invocation      | Explicit /xcsh submission called Sub-agent: xcsh; primary mode remained Default.                                                | Demonstrated delegation; failed selection    |
| Session configuration | Selector changed the exact session to xcsh via setSessionConfigOption; no public extension selection interface was established. | Supported UI; automatic integration unproven |
| Persisted default     | No default-setting control; UI/extension-created sessions and a second window started on Default.                               | Failed default fallback                      |
| Native tool transport | Primary xcsh agent reported the tool unavailable; no native invocation was recorded.                                            | Failed transport                             |
| Streamable HTTP MCP   | Extension-host endpoint received tools/call and returned the identity marker; incorrect or missing tokens returned 401.         | Demonstrated documented transport            |

The native agent exports no public selection API. The inspected selector calls
`setSessionConfigOption` for `mode` through its webview broker. CLI ACP
documentation describes separate CLI sessions, not attachment to the exact IDE
session. The clean MCP test returned both `XCSH_PROTOTYPE_IDENTITY` and the
alpha instruction marker.

The selected model remained `auto` in the observed native session configuration
before and after selection, session creation, reload, restart and multiple
windows. The existing xcsh conversation survived restart; a new session created
afterward again used Default. This proves preservation of the editor's selected
model value, not the identity of whichever underlying model Auto chooses for a
request.

Open Panel on an existing non-xcsh session retained Default. The resource draft
was inserted with `submit: false`, with no completed turn at that capture. A
later synthetic identity prompt appended to that draft and was manually sent;
that contaminated run was canceled at tool approval and excluded from clean
identity acceptance. Its failure is preserved privately. The canceled run did
not produce an identity invocation. Subsequent identity testing used a fresh
conversation with no attachment content. This failure also establishes why draft
contents must be checked independently from command return status.

The public command inventory and native session metadata were inspected in a
verified task extension host. React state and bundled implementation inspection
were diagnostic evidence; they are not production dependencies. The chat view
also displayed a stale loading banner while its independently observed session
state was loaded and idle, so the banner was not used to determine selection.

## Decision

No qualifying automatic or one-time default route has been established for this
installed Kiro version. Per-session manual selection and ordinary chat do not
satisfy the accepted fallback. Kiro delivery remains gated even though MCP
transport works. Repeating unchanged selection tests is not the next step; a
supported interface or an installed editor exposing the documented persisted
default would be a distinct candidate.

The reusable campaign fixture and gate regressions are development artifacts.
The shared F5 core extraction in xcsh #5072, specification-backed packaged
operations, optional CLI negotiation, both-editor production acceptance and
release/marketplace acceptance remain unimplemented or unverified. No package
publication, production VSIX acceptance, merge or release is claimed.

## Source verification

The six prototype gate/transport regressions passed. After generating the
repository's pinned specification artifacts in the fresh worktree, all 91
unit/webview suites (1,381 tests), full lint, and the complete application,
test, script and webview type checks passed. The staged PII enforcement scan and
secret scans of the new source and receipt were clean. A real Kiro
extension-host check preserved a deliberately edited task agent and recorded a
registration conflict. A direct native tool API invocation returned the identity
marker; that API-level result is separate from native-agent consumption, which
failed in the conversation experiment. The same direct native tool API check
passed in default-installed VS Code 1.143.1. These development-host checks do
not establish both-editor specialist acceptance or production VSIX acceptance.

Raw prompts, model reasoning, logs, authentication-bearing task agent files,
conversation IDs and screenshots remain private. This receipt contains only
sanitized findings.

## Documentation

- [Kiro slash commands](https://kiro.dev/docs/ide/chat/slash-commands/)
- [Kiro native selector and default documentation](https://kiro.dev/docs/ide/chat/)
- [Kiro MCP configuration](https://kiro.dev/docs/mcp/configuration/)
- [Kiro CLI ACP boundary](https://kiro.dev/docs/cli/acp/)
- [vscode-xcsh #1708](https://github.com/f5-sales-demo/vscode-xcsh/issues/1708)
- [xcsh #5072](https://github.com/f5-sales-demo/xcsh/issues/5072)
