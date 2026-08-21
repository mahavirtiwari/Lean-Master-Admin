import { DecimalPipe } from '@angular/common';
import { Component, input, output } from '@angular/core';

/**
 * Reusable pieces the 97 screens share. They live in one file because each is a
 * handful of lines and they are almost always imported together — a screen that
 * has a list has a section header, a pager and an empty state.
 */

/** The "Sectors / NIC 2008 industrial divisions…" block above a list. */
@Component({
  selector: 'app-page-intro',
  template: `
    <div class="intro">
      <div>
        <h2 class="intro-title">{{ title() }}</h2>
        @if (subtitle()) {
          <p class="intro-sub">{{ subtitle() }}</p>
        }
      </div>
      <ng-content />
    </div>
  `,
  styles: `
    .intro {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 20px;
    }
    .intro-title {
      font-size: var(--fs-section);
      font-weight: 700;
      color: var(--text-strong);
      margin: 0;
    }
    .intro-sub {
      font-size: var(--fs-body);
      color: var(--text-muted);
      margin: 7px 0 0;
    }
  `,
})
export class PageIntroComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
}

/** The no-data state the *-no-data.svg screens show. */
@Component({
  selector: 'app-empty',
  template: `
    <div class="empty">
      <svg width="46" height="46" viewBox="0 0 46 46" aria-hidden="true">
        <circle cx="23" cy="23" r="21" fill="var(--green-50)" stroke="var(--green-border)" />
        <path
          d="M15 19h16M15 24h16M15 29h9"
          stroke="var(--green)"
          stroke-width="1.7"
          stroke-linecap="round"
        />
      </svg>
      <div class="empty-title">{{ title() }}</div>
      <div class="empty-text">{{ text() }}</div>
      <ng-content />
    </div>
  `,
})
export class EmptyComponent {
  readonly title = input('No records found');
  readonly text = input('Nothing matches the current filters. Adjust them, or add the first record.');
}

/**
 * The pager under every table.
 *
 * Shaped after the scheme's other portals: a page-size chooser on the left, and
 * First / Prev / a page chooser / Next / Last on the right. The page number is a
 * dropdown rather than a row of buttons because a list of five lakh
 * registrations is twenty-five thousand pages, and no row of buttons survives
 * that — a select does, and it also lets somebody jump straight to page 800.
 */
@Component({
  selector: 'app-pager',
  template: `
    @if (total() > 0) {
      <div class="pager">
        <label class="pager-size">
          Show
          <select
            (change)="sizeChange.emit(+$any($event.target).value)"
            aria-label="Rows per page"
          >
            @for (size of sizes; track size) {
              <option [value]="size" [selected]="size === pageSize()">{{ size }}</option>
            }
          </select>
          Entries
        </label>

        <span class="pager-count">
          {{ from() | number }}–{{ to() | number }} of {{ total() | number }}
          {{ total() === 1 ? noun() : nounPlural() }}
        </span>

        <div class="pager-btns">
          <button class="pg" type="button" [disabled]="page() <= 1" (click)="go.emit(1)">First</button>
          <button class="pg" type="button" [disabled]="page() <= 1" (click)="go.emit(page() - 1)">
            Prev
          </button>

          <select
            class="pg pg-page"
            (change)="go.emit(+$any($event.target).value)"
            aria-label="Page"
          >
            @for (p of pages(); track p) {
              <option [value]="p" [selected]="p === page()">{{ p }}</option>
            }
          </select>

          <button
            class="pg"
            type="button"
            [disabled]="page() >= totalPages()"
            (click)="go.emit(page() + 1)"
          >
            Next
          </button>
          <button
            class="pg"
            type="button"
            [disabled]="page() >= totalPages()"
            (click)="go.emit(totalPages())"
          >
            Last
          </button>
        </div>
      </div>
    }
  `,
  imports: [DecimalPipe],
})
export class PagerComponent {
  readonly page = input.required<number>();
  readonly pageSize = input(25);
  readonly total = input.required<number>();
  readonly noun = input('record');
  readonly nounPlural = input('records');

  readonly go = output<number>();
  readonly sizeChange = output<number>();

  readonly sizes = [10, 20, 50, 100, 200] as const;

  totalPages(): number {
    return Math.max(1, Math.ceil(this.total() / this.pageSize()));
  }

  from(): number {
    return (this.page() - 1) * this.pageSize() + 1;
  }

  to(): number {
    return Math.min(this.page() * this.pageSize(), this.total());
  }

  /** Every page, for the chooser. */
  pages(): number[] {
    return Array.from({ length: this.totalPages() }, (_, index) => index + 1);
  }
}

/**
 * The confirmation dialogs behind Disable / Enable / Delete.
 *
 * `tone` decides the confirm button's colour: destructive actions are red on
 * the designs, reinstating ones green.
 */
@Component({
  selector: 'app-confirm',
  template: `
    <div class="modal-backdrop" (click)="cancelled.emit()">
      <div class="modal" (click)="$event.stopPropagation()">
        <div class="modal-body">
          <h3 class="modal-title">{{ title() }}</h3>
          <p class="modal-text">{{ message() }}</p>
          <ng-content />
        </div>
        <div class="modal-foot">
          <button class="btn btn-secondary" type="button" (click)="cancelled.emit()">
            {{ cancelLabel() }}
          </button>
          <button
            class="btn"
            type="button"
            [class.btn-danger]="tone() === 'danger'"
            [class.btn-primary]="tone() !== 'danger'"
            (click)="confirmed.emit()"
          >
            {{ confirmLabel() }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ConfirmComponent {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly confirmLabel = input('Confirm');
  readonly cancelLabel = input('Cancel');
  readonly tone = input<'danger' | 'primary'>('danger');

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
}

/** Active / Inactive and the workflow statuses, coloured as on the designs. */
@Component({
  selector: 'app-status',
  template: `<span class="pill" [class]="'pill-' + tone()">{{ label() }}</span>`,
})
export class StatusPillComponent {
  readonly label = input.required<string>();
  readonly tone = input<'green' | 'red' | 'amber' | 'blue' | 'grey' | 'orange'>('grey');
}
