// Switching client or close must not carry the previous note across.
//
// The other test file asserts what reaches the PDF. This one asserts WHOSE words
// reach it, which is the failure nobody would catch by looking: a paragraph
// written about one client rendering, even for a frame, on another client's
// report is the kind of mistake that gets sent before anyone notices.
//
// ReportNoteSection resets during render rather than in an effect, keyed on
// `${clientId}:${dailyImportId}:${reportType}` (ReportNoteSection.jsx:76). These
// pin both halves of that key, because a key on client alone bleeds across days
// and a key on the close alone bleeds across clients, and both read as plausible
// until the wrong text is in a client's inbox.

import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ReportNoteSection from './ReportNoteSection';

const noteFor = (text) => ({
  text, authorName: 'Pedro', updatedAt: '2026-08-11T21:00:00.000Z', clearedAt: '',
});

/** A store that answers per (client, close), the way Supabase does. */
function storeWith(byKey) {
  return {
    load: async ({ clientId, dailyImportId }) => ({
      note: byKey[`${clientId}:${dailyImportId}`] || null,
      reportId: 'r1',
      rows: 1,
    }),
    save: async () => ({}),
  };
}

const box = () => screen.getByRole('textbox');

describe('the note follows the client and the close, not the screen', () => {
  const store = storeWith({
    'clientA:day1': noteFor('Written about client A on day one.'),
    'clientB:day1': noteFor('Written about client B on day one.'),
    'clientA:day2': noteFor('Written about client A on day two.'),
  });

  it('swaps the text when the client changes on the same day', async () => {
    const { rerender } = render(
      <ReportNoteSection clientId="clientA" dailyImportId="day1" store={store} />,
    );
    await waitFor(() => expect(box().value).toContain('client A on day one'));

    rerender(<ReportNoteSection clientId="clientB" dailyImportId="day1" store={store} />);
    // The moment the prop changes, before the new load resolves: the previous
    // client's paragraph must already be gone rather than lingering a frame.
    expect(box().value).toBe('');
    await waitFor(() => expect(box().value).toContain('client B on day one'));
  });

  it('swaps the text when the close changes for the same client', async () => {
    const { rerender } = render(
      <ReportNoteSection clientId="clientA" dailyImportId="day1" store={store} />,
    );
    await waitFor(() => expect(box().value).toContain('client A on day one'));

    rerender(<ReportNoteSection clientId="clientA" dailyImportId="day2" store={store} />);
    expect(box().value).toBe('');
    await waitFor(() => expect(box().value).toContain('client A on day two'));
  });

  it('shows an empty box for a close nobody has written on', async () => {
    const { rerender } = render(
      <ReportNoteSection clientId="clientA" dailyImportId="day1" store={store} />,
    );
    await waitFor(() => expect(box().value).toContain('client A on day one'));

    // day3 is absent from the store. It must read as "nothing written here",
    // never as the last note that happened to be on screen.
    rerender(<ReportNoteSection clientId="clientA" dailyImportId="day3" store={store} />);
    await waitFor(() => expect(box().value).toBe(''));
  });
});
