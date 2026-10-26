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

The initial full-repository HEAD privacy scan failed on three existing findings
in `src/api/subscription.ts` and `src/test/unit/contextAddWizard.test.ts`. Those
files are unchanged from the fetched baseline. The clean staged scan therefore
qualified that prototype diff only. These findings were subsequently resolved
through fixture corrections and the managed scanner update described below.

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

## Context host implementation follow-up

Kiro production entrypoints are now gated: Open Panel, New Session and resource
attachments report unavailable specialist routing without opening ordinary chat
or changing a native draft. The commands remain reserved so the CLI chat cannot
become a fallback. Contexts and resource views continue to use their existing
activation, persistence and watcher implementation.

The new NativeContextHost prepares opaque window/context/revision snapshots
through ContextManager, checks files and environment synchronously before core
operations, and re-resolves credentials without refreshing an existing binding.
Its approval callback displays the exact redacted configuration and plan hash.
Receipts are written atomically in extension-owned private storage. The adapter
is preparation for the shared core dependency and production native tool wiring;
it is not yet activated by the extension.

Optional CLI probing first checks the documented help command for the capability
subcommand, preventing an older CLI from receiving it as a natural-language
request. The actual compiled CLI negotiated discovery. An absent executable and
a legacy fixture retained every bundled capability. The subprocess receives no
context or credential environment, and advertises no delegated mutation route.

A private VSIX with the real ContextManager and adapter was installed in default
VS Code 1.143.1 and Kiro 1.4.26, both embedding Node 24.21.0. Separate task
stores and the built-in custom dialog setting allowed checks of the complete
displayed configuration and hash. Approving create produced one synthetic write;
dismissing update and changing a context file blocked subsequent writes. A fresh
manager kept the stored context inactive. Node, Bun and xcsh executables were
absent from the editor-host PATH. The VSIX hash is
`d0d0f5eb7639f0754436427a0bc7daa20945aadee1ba7146d39768c5a688e8af`.

The first concurrent fixture shared an active pointer and invalidated a binding;
its native-dialog interactions were uncontrolled and excluded. That failure
remains private. The successful fixtures used separate stores and verified each
displayed plan before selecting its button. No cloud call or specialist routing
acceptance is inferred from these host-boundary tests.

The complete extension unit/webview suite passed (93 suites, 1,398 tests), as
did type checks and lint. Production native tool/agent registration, the
released core pin, supported Kiro primary routing, full marketplace VSIX and
released artifact acceptance remain open. No merge or publication is claimed.

## LiteLLM environment and VS Code native model prototype

The delivery direction remains one VSIX with editor-specific capability guards.
Both registries must continue serving identical versions and hashes. Registry
publishing credentials and editor model authentication are separate concerns.

The new native VS Code provider reads `LITELLM_BASE_URL` and `LITELLM_API_KEY`
from the extension-host environment and discovers gateway chat models with
published token limits. It preserves message history and tool result identities,
uses stable wire aliases for native tool names, streams text and complete tool
calls, rejects redirects and incomplete responses, and cancels transport on
provider disposal. It does not select a model or transfer native credentials.
Kiro registration is gated because its native chat does not consume this
provider.

The installed prototype discovered 50 chat models from a 59-model gateway
catalog. Native API probes with `claude-opus-5-5` and `gpt-6.1-sol` both
returned the required synthetic tool call. Full native Local-harness turns
selected xcsh, invoked its identity tool, read the actual bundled specification
constraint, and reported specification version 12.5.1. The turn receipts
identified the exact requested LiteLLM model, which remained selected afterward.

The first full turn through the new Copilot harness instead used Auto/GPT-6 Luna
despite the picker showing Opus. That turn is excluded. Ordinary New Chat also
returned to that harness; an attempted turn was canceled and excluded. The
supported New Local Chat command created a Local conversation, selected the
contributed xcsh agent by its URI, and preserved the selected gateway model.
Reloading a blank session returned to the Copilot/Auto entrypoint, so complete
reload, multiple-window, conflict, and existing-conversation routing acceptance
remains pending. No production native-agent route is claimed from these partial
routing checks.

A native Custom Endpoint configuration with environment-variable placeholders
failed to resolve its secret key. It was removed from the task profile, and the
provider API was used instead. Native APIs and supported commands are production
interfaces; debugger, DOM, and SQLite inspection remain diagnostic evidence
only. All raw gateway metadata, model outputs, sessions, and failed captures
remain private. No marketplace publication or release acceptance is claimed.

## Recovery campaign and actual native F5 tool

The resumed campaign confirmed warm Local-harness behavior with the supported
New Local Chat and Open Chat commands. Moving from the distinguishable second
agent to xcsh created a distinct conversation, invoked the primary agent's ALPHA
identity tool, and preserved `gpt-6.1-sol`. A completed Local conversation
retained its agent and model after reload. Blank reload behavior remains
different: the default entrypoint can return to Copilot/Auto.

New Local Chat inherited an unsubmitted resource draft unless its supported
`inputValue` and `isPartialQuery` arguments initialized a blank draft. The draft
test performed no tool invocation or submission. This proves draft behavior in
the prototype; it does not establish preservation of every draft in native
history. A fresh production attachment design still requires that verification.

Fresh extension updates exposed an additional race. The agent-selection command
returned successfully before xcsh was available, leaving ordinary Agent
selected. Failed preflights submitted nothing. A distinct candidate that first
revealed chat and awaited native model discovery still failed cold selection in
the two-window test. Warm URI selection remains demonstrated behavior, not
complete automatic-routing acceptance. No startup delay or debugger function has
been promoted to a production dependency.

The new source adapter, `NativeF5Tool`, uses a separate context host and actual
core per native invocation. Plans and opaque private references cannot cross
requests. Writes require the native opaque request token and exact core-owned
approval. Focused tests cover concurrent ownership, inactive contexts,
cancellation during planning, disablement, registration conflict, uncertain
mutation failure, private error sanitization, and late verified completion. The
full unit/webview suite passed 95 suites and 1,414 tests; type checks, lint,
production packaging, and security audit passed. The actual package's public
Node declarations are structurally assignable to the adapter factory.

Installed private prototype 0.0.4 invoked the adapter from primary xcsh through
`gpt-6.1-sol`, using the real ContextManager and pinned specification. Read-only
description returned the actual map constraint. Exact displayed entries and
hashes were matched before approving a synthetic create and delete; an update
was dismissed. Only POST and DELETE reached the synthetic transport. The three
turns retained their requested model and had distinct conversation IDs. No F5
cloud endpoint was contacted.

Private prototype 0.0.5 included the final late-cancellation behavior and ran an
actual native F5 description through `claude-opus-5-5` in the second task
window. These are installed prototype results, not production activation, cloud
mutation, publication, or release acceptance. The extracted shared core remains
unpublished, and the production extension has no private dependency or premature
native F5 registration. Kiro delivery remains gated.

Installed private prototype VSIX SHA-256 receipts:

| Prototype | SHA-256                                                            |
| --------- | ------------------------------------------------------------------ |
| 0.0.4     | `431b0973dc3946d7970c2f09392a506024aa051c6e743bf24c46f40d38496cc5` |
| 0.0.5     | `a6ffbb03adeca6ad9959d770fd6d6b4152d498a0a3ea9bc7de86a30ede761ecd` |

## Default-profile and guarded-contribution follow-up

The operator authorized reusing their default VS Code and Kiro profiles for
testing. Further default-profile work uses task-owned workspaces and native
sign-in in place, with context fixtures and raw evidence kept separate. Native
credentials are not copied, and unrelated profile settings are preserved.

Inspection found an anonymous-session branch that resets empty sessions to
built-in Agent when the available modes change. After native sign-in, a Local
reload experiment retained xcsh and `claude-opus-5-5` and invoked the actual F5
description tool. This supports an authentication-related explanation, while
fresh registration and full routing acceptance remain separate checks.

Prototype 0.0.6 exercises the source readiness registration and Local-only
manifest guards. In an extension development host using the default VS Code
profile, the route reached xcsh with `claude-opus-5-5`. An exact native-window
preflight confirmed the primary agent, model, Local harness and empty draft
before an explicit synthetic identity submission. The request returned ALPHA and
the pinned specification version through the requested model. No profile
configuration values were changed for this test.

One earlier identity turn was submitted without a qualified primary-agent
preflight. It is excluded. Subsequent submissions require a positive preflight;
raw failed and accepted captures remain private. Default-profile,
development-host and prototype results do not establish released-artifact
acceptance.

The source now contributes the native F5 tool and Local-only xcsh agent, guarded
by successful tool readiness and excluded from Kiro. Removal clears readiness.
The agent instructions are included in the VSIX without a model override. All 95
unit/webview suites and 1,416 tests passed, along with type checks, lint and
production packaging. Production core registration and the published pin remain
pending, so these declarations are not exposed prematurely.

Two email fixtures now use the repository's accepted documentation domain. The
computed subscription-name false positive was resolved upstream in docs-control
PR `#2611` and propagated through the normal managed workflow in vscode-xcsh PR
`#1713` and xcsh PR `#5078`. The scanner checks executable runtime interpolation
without a suppression or skipped path; subscription runtime naming is unchanged.
The extension's independent full HEAD enforcement scan is clean. This verifies
the two consuming repositories, not the remaining fleet.

## Authenticated Kiro default-profile candidate

On 2026-10-26, a task-owned workspace in the authorized default Kiro profile
used native Builder ID sign-in. Process-specific accessibility capture and
extension workspace verification bound the experiment to the same window. Two
documented workspace agent configurations appeared in the native selector.
Selecting the xcsh prototype changed the primary selector while preserving the
native Auto model. The selector exposed no persistent-default control.

Both the native New session button and extension-invoked `focusChatInput` with
`ensureSession`, `newSession` and `submit: false` created sessions on Default,
with Auto preserved. No model request or tool invocation was submitted in this
candidate. Authentication therefore did not establish a supported automatic
route or the one-time native-default fallback. Kiro delivery remains gated.

An earlier accessibility capture belonged to a separate qualification process
with the same application path and generic window title. Its agent-list and Opus
label observations are excluded from this candidate. Raw captures are retained
privately; no agent selection or prompt submission occurred there.

## Default-profile installed VS Code reload and resource draft

Installed prototype 0.0.7 retained `gpt-6.1-sol` and Local after reload, but the
restored conversation's primary selector changed to built-in Agent. Running the
prototype's supported Local entrypoint then selected xcsh with the same model.
This demonstrates entrypoint recovery after reload, not automatic restoration of
the prior conversation's specialist.

A synthetic resource payload inserted with `isPartialQuery: true` remained an
unsubmitted native draft with xcsh and the selected model preserved. Opening
xcsh again retained that draft. Identity and F5 invocation counts did not
increase. Process- and window-specific accessibility captures qualify these
observations in the authorized default profile; full lifecycle and released
production artifact acceptance remain open.
