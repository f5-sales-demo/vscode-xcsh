// webview/src/components/EmptyState.tsx
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { F5AsciiLogo } from '../assets/pi-logo';

// Static welcome screen: just the F5 logo in the red frame, matching the
// xcsh TUI. No dynamic model-provider / integration status — the chat no
// longer probes plugins on open.
export function EmptyState() {
  return (
    <div className="welcomeBox">
      <div className="welcomeBoxVersion">xcsh</div>
      <div className="welcomeContent">
        <F5AsciiLogo />
      </div>
    </div>
  );
}
