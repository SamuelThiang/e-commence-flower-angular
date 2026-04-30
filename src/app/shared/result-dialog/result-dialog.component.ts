import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

let nextDialogUid = 0;

/**
 * Shared success / error modal (same chrome as register & checkout).
 * Use via {@link ResultDialogService} from `app.component`, or bind inputs locally.
 */
@Component({
  selector: 'app-result-dialog',
  standalone: true,
  templateUrl: './result-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultDialogComponent {
  private readonly uid = `rd-${nextDialogUid++}`;
  readonly headingId = `${this.uid}-heading`;
  readonly descriptionId = `${this.uid}-desc`;

  readonly open = input(false);
  readonly variant = input<'success' | 'error'>('success');
  readonly heading = input.required<string>();
  readonly message = input.required<string>();
  readonly detailLine = input<string | null>(null);
  readonly primaryLabel = input('Done');
  /** Use alertdialog + describedby for error-style announcements. */
  readonly useAlertRole = input(false);

  readonly primaryAction = output<void>();
}
