import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatTableModule } from '@angular/material/table'
import { Store } from '@ngrx/store'
import { map } from 'rxjs'
import type { ThresholdVersion } from '../domain'
import { PackageBannerComponent } from '../components/package-banner.component'
import { SpatialMapComponent } from '../components/spatial-map.component'
import { TailingsActions } from '../store/tailings.actions'
import { selectAnomalies, selectDataset, selectPoints, selectRecomputeJobs, selectReviewPackage, selectThresholdVersions } from '../store/tailings.selectors'

interface Draft {
  thresholdId: string
  warning: number
  alarm: number
  changeRate: number
  changeNote: string
}

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatTableModule, SpatialMapComponent, PackageBannerComponent],
  template: `
    <section class="page">
      <app-package-banner />
      <div class="metrics">
        <article><span>监测点</span><strong>{{ pointCount$ | async }}</strong><small>位移、水位、渗流、降雨</small></article>
        <article><span>异常点</span><strong>{{ abnormalCount$ | async }}</strong><small>按读数当前评判同步</small></article>
        <article><span>待重算读数</span><strong>{{ pendingReadingCount$ | async }}</strong><small>旧读数保留原判</small></article>
        <article><span>未完成重算</span><strong>{{ unfinishedJobCount$ | async }}</strong><small>断点恢复中/待受理</small></article>
      </div>
      <app-spatial-map [points]="(points$ | async) ?? []" />
      <div class="threshold-band">
        <div class="band-head">
          <div><h2>阈值版本与草稿冻结</h2><p>阈值草稿提交即冻结为新版本：重算范围同时冻结，旧版本转为“已失效”但历史判定仍按其解释。</p></div>
        </div>
        <div class="two-cols">
          <div>
            <h3>阈值版本链</h3>
            <table mat-table [dataSource]="(thresholds$ | async) ?? []">
              <ng-container matColumnDef="type"><th mat-header-cell *matHeaderCellDef>类型</th><td mat-cell *matCellDef="let row">{{ row.type }}</td></ng-container>
              <ng-container matColumnDef="id"><th mat-header-cell *matHeaderCellDef>版本</th><td mat-cell *matCellDef="let row"><b>{{ row.id }}</b></td></ng-container>
              <ng-container matColumnDef="warning"><th mat-header-cell *matHeaderCellDef>预警</th><td mat-cell *matCellDef="let row">{{ row.warning }}</td></ng-container>
              <ng-container matColumnDef="alarm"><th mat-header-cell *matHeaderCellDef>报警</th><td mat-cell *matCellDef="let row">{{ row.alarm }}</td></ng-container>
              <ng-container matColumnDef="rate"><th mat-header-cell *matHeaderCellDef>变化率</th><td mat-cell *matCellDef="let row">{{ row.changeRate }} {{ row.unit }}</td></ng-container>
              <ng-container matColumnDef="status"><th mat-header-cell *matHeaderCellDef>状态</th><td mat-cell *matCellDef="let row"><span class="tag" [class.dead]="row.status === '已失效'">{{ row.status }}</span><small class="sub">{{ row.submittedBy }} · {{ row.submittedAt.replace('T', ' ').slice(0, 16) }}</small></td></ng-container>
              <tr mat-header-row *matHeaderRowDef="thresholdColumns"></tr><tr mat-row *matRowDef="let row; columns: thresholdColumns" [class.superseded]="row.status === '已失效'"></tr>
            </table>
            <p class="note">已失效版本不删除：异常原判、现场复核和审阅包仍可回到对应版本解释。</p>
          </div>
          <div class="draft-panel">
            <h3>提交阈值草稿</h3>
            <fieldset [disabled]="(pkg$ | async)">
            <mat-form-field appearance="outline"><mat-label>阈值族</mat-label>
              <select matNativeControl [(ngModel)]="draft.thresholdId" (ngModelChange)="prefillDraft()">
                <option *ngFor="let group of activeGroups$ | async" [value]="group.thresholdId">{{ group.type }} · {{ group.id }}（当前V{{ group.version }}）</option>
              </select>
            </mat-form-field>
            <div class="triple">
              <mat-form-field appearance="outline"><mat-label>预警值</mat-label><input matInput type="number" [(ngModel)]="draft.warning" /></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>报警值</mat-label><input matInput type="number" [(ngModel)]="draft.alarm" /></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>变化率限值</mat-label><input matInput type="number" [step]="0.1" [(ngModel)]="draft.changeRate" /></mat-form-field>
            </div>
            <mat-form-field appearance="outline" class="wide"><mat-label>变更说明（必填，随版本冻结）</mat-label><textarea matInput rows="2" [(ngModel)]="draft.changeNote"></textarea></mat-form-field>
            <p class="hint" *ngIf="draftError">{{ draftError }}</p>
            <button mat-flat-button color="primary" (click)="submitDraft()">提交草稿并冻结版本/范围</button>
            </fieldset>
            <p class="note">提交后：旧读数保留原判进入“待重算”，受影响异常按旧依据的处置方案先暂停批准。</p>
          </div>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .page { padding: 22px 28px 45px; }
    .metrics { display: grid; grid-template-columns: repeat(4, 1fr); background: white; border: 1px solid #d9e1df; margin-bottom: 15px; }
    .metrics article { padding: 17px 19px; border-right: 1px solid #e2e8e6; } .metrics article:last-child { border: 0; }
    .metrics span, .metrics strong, .metrics small { display: block; } .metrics span { color: #72807d; font-size: 12px; } .metrics strong { font-size: 27px; color: #245060; margin: 6px 0; } .metrics small { color: #98a4a0; font-size: 10px; }
    .threshold-band { background: white; border: 1px solid #d9e1df; margin-top: 15px; padding: 16px; } .band-head h2 { margin: 0 0 5px; font-size: 17px; } .band-head p { color: #72807d; font-size: 12px; margin: 0 0 12px; }
    .two-cols { display: grid; grid-template-columns: 1.5fr 1fr; gap: 18px; align-items: start; } table { width: 100%; }
    .tag { padding: 2px 7px; border-radius: 3px; background: #e7f3ee; color: #2e765a; font-size: 11px; } .tag.dead { background: #ececec; color: #8a8f8d; }
    .sub { display: block; color: #98a4a0; font-size: 9px; margin-top: 3px; } .superseded { opacity: 0.62; }
    h3 { font-size: 13px; margin: 4px 0 10px; }
    .draft-panel { border: 1px dashed #c4d0cd; background: #fafcfb; padding: 14px; display: grid; gap: 4px; }
    .draft-panel fieldset { border: 0; padding: 0; margin: 0; min-width: 0; display: grid; gap: 4px; }
    .draft-panel fieldset:disabled { opacity: 0.55; }
    .draft-panel select { width: 100%; height: 43px; border: 1px solid #c2cbc8; border-radius: 4px; padding: 0 10px; background: white; font-size: 13px; }
    .triple { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; } .wide { width: 100%; }
    .note { color: #8a9693; font-size: 10px; margin: 8px 0 0; } .hint { color: #a43c35; font-size: 11px; margin: 4px 0; }
    .draft-panel button { justify-self: start; }
  `]
})
export class DashboardPageComponent {
  private readonly store = inject(Store)
  readonly points$ = this.store.select(selectPoints)
  readonly anomalies$ = this.store.select(selectAnomalies)
  readonly dataset$ = this.store.select(selectDataset)
  readonly thresholds$ = this.store.select(selectThresholdVersions)
  readonly jobs$ = this.store.select(selectRecomputeJobs)
  readonly pkg$ = this.store.select(selectReviewPackage)
  readonly activeGroups$ = this.thresholds$.pipe(
    map((versions) => versions.filter((item) => item.status === '生效中').sort((a, b) => a.thresholdId.localeCompare(b.thresholdId)))
  )
  readonly pointCount$ = this.points$.pipe(map((points) => points.length))
  readonly abnormalCount$ = this.points$.pipe(map((points) => points.filter((point) => point.status !== '正常').length))
  readonly pendingReadingCount$ = this.dataset$.pipe(map((dataset) => dataset.evaluations.filter((item) => item.recomputeStatus === '待重算').length))
  readonly unfinishedJobCount$ = this.jobs$.pipe(map((jobs) => jobs.filter((job) => job.status === '待受理' || job.status === '重算中' || job.status === '失败可恢复').length))
  readonly thresholdColumns = ['type', 'id', 'warning', 'alarm', 'rate', 'status']

  draft: Draft = { thresholdId: 'T-D', warning: 10, alarm: 16, changeRate: 3, changeNote: '' }
  draftError = ''
  private primed = false

  constructor() {
    this.activeGroups$.subscribe((groups) => {
      if (!groups.length) return
      if (!this.primed || !groups.some((group) => group.thresholdId === this.draft.thresholdId)) {
        this.primed = true
        this.draft.thresholdId = groups[0].thresholdId
        this.applyFromVersion(groups[0])
      }
    }).unsubscribe()
  }

  prefillDraft(): void {
    let group: ThresholdVersion | undefined
    this.activeGroups$.subscribe((groups) => { group = groups.find((item) => item.thresholdId === this.draft.thresholdId) }).unsubscribe()
    if (group) this.applyFromVersion(group)
    this.draftError = ''
  }

  private applyFromVersion(group: ThresholdVersion): void {
    this.draft.warning = group.warning
    this.draft.alarm = group.alarm
    this.draft.changeRate = group.changeRate
  }

  submitDraft(): void {
    if (!(this.draft.alarm > this.draft.warning)) {
      this.draftError = '报警值必须大于预警值。'
      return
    }
    if (!this.draft.changeNote.trim()) {
      this.draftError = '变更说明必填，随版本冻结留痕。'
      return
    }
    this.store.dispatch(TailingsActions.submitThresholdDraft({
      thresholdId: this.draft.thresholdId,
      warning: Number(this.draft.warning),
      alarm: Number(this.draft.alarm),
      changeRate: Number(this.draft.changeRate),
      changeNote: this.draft.changeNote
    }))
    this.draft.changeNote = ''
    this.draftError = ''
  }
}
