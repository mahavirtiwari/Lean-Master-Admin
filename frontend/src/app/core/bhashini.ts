/**
 * The Bhashini language picker is loaded in index.html and mounts one button
 * into `.bhashini-plugin-container`, a div that lives directly in <body>.
 *
 * That node is deliberately never re-parented into a component. Borrowing it
 * into a header slot was tried and does not survive: Angular detaches a view's
 * DOM before ngOnDestroy — and before NavigationStart handlers can rescue it —
 * so the button was destroyed along with the sign-in screen and no picker
 * remained anywhere in the portal. Leaving it in <body> and positioning it with
 * CSS keeps it alive across every route, sign-in and sign-out.
 */

/** What Bhashini has stored as the reader's choice, defaulting to English. */
export function readPreferred(): string {
  try {
    return localStorage.getItem('preferredLanguage') || 'en';
  } catch {
    // Private-browsing modes can throw on localStorage; the label is cosmetic.
    return 'en';
  }
}

/**
 * The 22 scheduled languages plus English, keyed by the code Bhashini stores.
 *
 * Used only to name the current selection beside the picker — the plugin's own
 * button shows a glyph and not which language is active.
 */
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  as: 'Assamese',
  bn: 'Bengali',
  brx: 'Bodo',
  doi: 'Dogri',
  gom: 'Konkani',
  gu: 'Gujarati',
  hi: 'Hindi',
  kn: 'Kannada',
  ks: 'Kashmiri',
  mai: 'Maithili',
  ml: 'Malayalam',
  mni: 'Manipuri',
  mr: 'Marathi',
  ne: 'Nepali',
  or: 'Odia',
  pa: 'Punjabi',
  sa: 'Sanskrit',
  sat: 'Santali',
  sd: 'Sindhi',
  ta: 'Tamil',
  te: 'Telugu',
  ur: 'Urdu',
};

/** The display name for a Bhashini code; the code itself if it is unknown. */
export function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code.toUpperCase();
}

/**
 * Give the plugin's button a visible language name and a caret.
 *
 * The widget ships an icon-only control: its button holds nothing but the
 * script glyph, with no label element to reveal. So the name is appended into
 * the plugin's own button rather than placed beside it — that keeps one
 * clickable control (the plugin's own handler still opens the list) instead of
 * a label that looks attached but is not.
 *
 * Called once at start-up. Like the container itself, nothing here is tied to a
 * component lifetime; see the note at the top of this file.
 */
export function enhancePicker(): void {
  const container = document.querySelector('.bhashini-plugin-container');
  if (!container) return;

  const sync = (): void => {
    const label = container.querySelector('.bhashini-lang-name');
    if (label) label.textContent = languageName(readPreferred());
  };

  const decorate = (): boolean => {
    const button = container.querySelector('.bhashini-dropdown-btn');
    if (!button) return false;

    if (!button.querySelector('.bhashini-lang-name')) {
      const label = document.createElement('span');
      // Both classes: the plugin skips its own markup by either name, and the
      // label must not be fed back into the translator.
      label.className = 'bhashini-lang-name dont-translate bhashini-skip-translation';
      button.appendChild(label);

      const caret = document.createElement('span');
      caret.className = 'bhashini-lang-caret';
      caret.setAttribute('aria-hidden', 'true');
      button.appendChild(caret);
    }

    sync();
    return true;
  };

  if (!decorate()) {
    // The script is deferred, so the button usually appears after this runs.
    const observer = new MutationObserver(() => {
      if (decorate()) observer.disconnect();
    });
    observer.observe(container, { childList: true, subtree: true });
  }

  // The plugin stores the choice and then translates; the write is not
  // observable, so re-read a few times after any click inside the widget.
  container.addEventListener('click', () => {
    for (const delay of [60, 400, 1200]) setTimeout(sync, delay);
  });

  // A change made in another tab.
  window.addEventListener('storage', sync);
}
