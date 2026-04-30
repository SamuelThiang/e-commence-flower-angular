import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterOutlet, Router, NavigationStart, NavigationEnd, NavigationCancel, NavigationError } from '@angular/router';
import { NgxSpinnerModule } from 'ngx-spinner';
import { Subscription } from 'rxjs';
import { LoadingService } from './core/loading.service';
import { ResultDialogComponent } from './shared/result-dialog/result-dialog.component';
import { ResultDialogService } from './shared/result-dialog/result-dialog.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NgxSpinnerModule, ResultDialogComponent],
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'flower-angular';

  private readonly router = inject(Router);
  private readonly loading = inject(LoadingService);
  readonly resultDialog = inject(ResultDialogService);
  private routerSub?: Subscription;

  ngOnInit(): void {
    this.routerSub = this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.loading.show();
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        this.loading.hide();
      }
    });
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
  }
}
