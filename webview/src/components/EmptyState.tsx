// webview/src/components/EmptyState.tsx
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { useSyncExternalStore } from 'react';
import { CheckIcon, CrossIcon } from '../assets/icons';
import { PiLogo } from '../assets/pi-logo';
import { getWelcomeState, subscribeWelcome } from '../main';

export function EmptyState() {
  const welcome = useSyncExternalStore(subscribeWelcome, getWelcomeState);

  return (
    <div className="emptyState">
      <div className="emptyStateContent">
        <div className="emptyStateLogo">
          <PiLogo size={80} />
        </div>
        <div className="emptyStateInfo">
          <div className="emptyStateVersion">xcsh {welcome.version ?? ''}</div>
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
                  <span className={`checkIcon ${integration.connected ? 'connected' : 'disconnected'}`}>
                    {integration.connected ? <CheckIcon /> : <CrossIcon />}
                  </span>
                  <span>{integration.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
