// The session tests prove `setReferences` SHAPES the data correctly. This proves a
// cited source actually PAINTS as a usable link in the transcript — a different
// claim, and the one the user experiences.
import { render, screen } from '@testing-library/react';
import { MessageList } from '../components/MessageList';
import type { ChatMessage } from '../state/session';

function assistant(text: string, references?: { kind: 'doc' | 'console'; title: string; url: string }[]) {
  return {
    type: 'assistant',
    blocks: [{ type: 'text', text }],
    ...(references ? { references } : {}),
  } as ChatMessage;
}

describe('MessageList · cited sources', () => {
  it('renders a link for each source the answer cited', () => {
    render(
      <MessageList
        messages={[
          { type: 'user', text: 'which LB?' } as ChatMessage,
          assistant('Use an HTTP LB.', [
            { kind: 'doc', title: 'HTTP LB guide', url: 'https://docs.cloud.f5.com/lb' },
            {
              kind: 'console',
              title: 'Load Balancers',
              url: 'https://example-corp.console.ves.volterra.io/lb',
            },
          ]),
        ]}
        busy={false}
      />,
    );

    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      'https://docs.cloud.f5.com/lb',
      'https://example-corp.console.ves.volterra.io/lb',
    ]);
    expect(links[0]).toHaveTextContent('HTTP LB guide');
  });

  it('renders no link row when the answer cited nothing', () => {
    render(<MessageList messages={[assistant('No sources needed.')]} busy={false} />);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('keeps each turn’s sources under its own answer', () => {
    render(
      <MessageList
        messages={[
          { type: 'user', text: 'a' } as ChatMessage,
          assistant('one', [{ kind: 'doc', title: 'First', url: 'https://d/1' }]),
          { type: 'user', text: 'b' } as ChatMessage,
          assistant('two', [{ kind: 'doc', title: 'Second', url: 'https://d/2' }]),
        ]}
        busy={false}
      />,
    );
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveTextContent('First');
    expect(links[1]).toHaveTextContent('Second');
  });
});
