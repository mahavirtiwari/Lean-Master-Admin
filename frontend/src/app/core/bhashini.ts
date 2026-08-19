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
