import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { Store } from '@ngrx/store'
import { TailingsActions } from '../store/tailings.actions'
import { selectReviewPackage } from '../store/tailings.selectors'

@Component({
  selector: 'app-package-banner',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  template: `
    <div class="banner" *ngIf="pkg$ | async as pkg">
      <b>审阅包视图：{{ pkg.label }}</b>
      <span>{{ pkg.id }} · 导出于 {{ pkg.exportedAt.replace('T', ' ').slice(0, 16) }} · 当前页面按包内固定版本解释，操作已锁定</span>
      <button mat-stroked-button (click)="close()">返回实时数据</button>
    </div>
  `,
  styles: [`
    .banner { display: flex; align-items: center; gap: 12px; background: #274852; color: white; padding: 10px 16px; margin-bottom: 12px; }
    .banner b { font-size: 13px; } .banner span { flex: 1; color: #b7cbd1; font-size: 11px; }
    .banner button { color: #fff; border-color: #6d8b94; }
  `]
})
export class PackageBannerComponent {
  private readonly store = inject(Store)
  readonly pkg$ = this.store.select(selectReviewPackage)
  close(): void { this.store.dispatch(TailingsActions.closeReviewPackage()) }
}
