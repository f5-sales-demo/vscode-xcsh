// webview/src/components/EmptyState.tsx
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { useSyncExternalStore } from 'react';
import { CheckIcon, DashIcon, WarningIcon } from '../assets/icons';
import { F5AsciiLogo } from '../assets/pi-logo';
import { getWelcomeState, subscribeWelcome } from '../main';

function stateIcon(state: 'connected' | 'unauthenticated' | 'unavailable') {
  switch (state) {
    case 'connected':
      return <CheckIcon />;
    case 'unauthenticated':
      return <WarningIcon />;
    case 'unavailable':
      return <DashIcon />;
  }
}

export function EmptyState() {
  const welcome = useSyncExternalStore(subscribeWelcome, getWelcomeState);

  return (
    <div className="welcomeBox">
      <div className="welcomeBoxVersion">{welcome.version ? `xcsh ${welcome.version}` : 'xcsh'}</div>
      <div className="welcomeContent">
        <div className="welcomeLeft">
          <F5AsciiLogo />
        </div>
        <div className="welcomeDivider" />
        <div className="welcomeRight">
          {welcome.modelProvider && (
            <div className="emptyStateSection">
              <div className="emptyStateSectionTitle">Model Provider</div>
              <div className="emptyStateCheck">
                <span className="checkIcon connected">
                  <CheckIcon />
                </span>
                <span>{welcome.modelProvider}</span>
              </div>
            </div>
          )}
          {welcome.integrations && welcome.integrations.length > 0 && (
            <div className="emptyStateSection">
              <div className="emptyStateDivider" />
              {welcome.integrations.map((integration) => (
                <div key={integration.name} className="emptyStateCheck">
                  <span className={`checkIcon ${integration.state}`}>{stateIcon(integration.state)}</span>
                  <span>{integration.name}</span>
                  {integration.hint && <span className="hintText">{integration.hint}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
