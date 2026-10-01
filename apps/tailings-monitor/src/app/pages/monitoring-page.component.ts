import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatSelectModule } from '@angular/material/select'
import { MatTableModule } from '@angular/material/table'
import { Store } from '@ngrx/store'
import { map } from 'rxjs'
import { TailingsActions } from '../store/tailings.actions'
import { selectDataset, selectNotice } from '../store/tailings.selectors'

@Component({
  selector: 'app-monitoring-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatTableModule],
  template: `
    <section class="page">
      <div class="page-head"><div><h2>测点与原始读数</h2><p>原始读数只读；判定按阈值版本盖章，阈值更新后旧读数保留原判并进入待重算。</p></div><mat-form-field appearance="outline"><mat-label>搜索测点</mat-label><input matInput [(ngModel)]="keyword" /></mat-form-field></div>
      <div class="notice" *ngIf="notice$ | async as notice">{{ notice }}</div>
      <div class="split">
        <table mat-table [dataSource]="filteredPoints$ | async" class="panel">
          <ng-container matColumnDef="name"><th mat-header-cell *matHeaderCellDef>测点</th><td mat-cell *matCellDef="let row">{{ row.name }}</td></ng-container>
          <ng-container matColumnDef="zone"><th mat-header-cell *matHeaderCellDef>分区</th><td mat-cell *matCellDef="let row">{{ row.zone }}</td></ng-container>
          <ng-container matColumnDef="type"><th mat-header-cell *matHeaderCellDef>类型</th><td mat-cell *matCellDef="let row">{{ row.type }}</td></ng-container>
          <ng-container matColumnDef="value"><th mat-header-cell *matHeaderCellDef>当前值</th><td mat-cell *matCellDef="let row"><b>{{ row.currentValue }} {{ row.unit }}</b></td></ng-container>
          <ng-container matColumnDef="status"><th mat-header-cell *matHeaderCellDef>状态</th><td mat-cell *matCellDef="let row"><span class="status" [class.danger]="row.status === '异常'" [class.warning]="row.status === '预警'">{{ row.status }}</span></td></ng-container>
          <tr mat-header-row *matHeaderRowDef="pointColumns"></tr><tr mat-row *matRowDef="let row; columns: pointColumns"></tr>
        </table>
        <div class="panel readings">
          <h3>最近原始读数 <small>判定按阈值版本盖章</small></h3>
          <article *ngFor="let reading of readingRows$ | async">
            <div><b>{{ reading.pointId }}</b><span>{{ reading.quality }}</span></div>
            <strong>{{ reading.value }} {{ reading.unit }}</strong>
            <small>{{ reading.capturedAt.replace('T', ' ') }} · 设备{{ reading.deviceId }}</small>
            <footer *ngIf="reading.verdict">
              <span class="status" [class.danger]="reading.verdict.verdict === '异常'" [class.warning]="reading.verdict.verdict === '预警'">{{ reading.verdict.verdict }}</span>
              <em>判据 {{ reading.versionLabel }}</em>
              <mark *ngIf="reading.verdict.pendingRecalc">待重算</mark>
            </footer>
          </article>
          <p>设备读数写入后不可修改；阈值更新不改写原判，只追加新版本判定。</p>
        </div>
      </div>
      <div class="panel thresholds">
        <div class="th-head"><div><h3>阈值版本</h3><p>草稿提交即冻结适用版本并生效，旧版本废止；受影响异常自动受理重算。</p></div></div>
        <div class="th-grid">
          <section *ngFor="let row of thresholdRows$ | async">
            <header><b>{{ row.threshold.type }}阈值</b><span>V{{ row.active?.version }} 已生效</span></header>
            <p>预警 {{ row.active?.warning }} · 报警 {{ row.active?.alarm }} · 速率 {{ row.active?.changeRate }} {{ row.threshold.unit }}</p>
            <small>冻结于 {{ row.active?.frozenAt?.replace('T', ' ').slice(0, 16) }} · {{ row.active?.submittedBy }}</small>
            <details *ngIf="row.history.length"><summary>历史版本 {{ row.history.length }}</summary><div *ngFor="let v of row.history">V{{ v.version }} · {{ v.status }} · 预警{{ v.warning }}/报警{{ v.alarm }} · {{ v.frozenAt.slice(0, 10) }} · {{ v.note }}</div></details>
          </section>
        </div>
        <div class="draft-form">
          <mat-form-field appearance="outline"><mat-label>阈值类型</mat-label><mat-select [(ngModel)]="draft.thresholdId"><mat-option *ngFor="let row of thresholdRows$ | async" [value]="row.threshold.id">{{ row.threshold.type }}（现行V{{ row.active?.version }}）</mat-option></mat-select></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>预警值</mat-label><input matInput type="number" [(ngModel)]="draft.warning" /></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>报警值</mat-label><input matInput type="number" [(ngModel)]="draft.alarm" /></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>变化速率</mat-label><input matInput type="number" [(ngModel)]="draft.changeRate" /></mat-form-field>
          <mat-form-field appearance="outline" class="wide"><mat-label>调整说明</mat-label><input matInput [(ngModel)]="draft.note" /></mat-form-field>
          <button mat-flat-button color="primary" (click)="submitDraft()">提交草稿并冻结版本</button>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .page { padding: 22px 28px 45px; }.page-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }.page-head h2 { margin: 0 0 5px; font-size: 20px; }.page-head p { margin: 0; color: #72807d; font-size: 12px; }
    .notice { background: #fae8e6; color: #a43c35; border-left: 3px solid #a43c35; padding: 9px 12px; font-size: 12px; margin-bottom: 12px; }
    .split { display: grid; grid-template-columns: 1fr 330px; gap: 14px; align-items: start; }.panel { background: white; border: 1px solid #d9e1df; } table { width: 100%; }
    .readings { padding: 15px; } .readings h3 { font-size: 14px; margin: 0 0 12px; } .readings h3 small { color: #8b9895; font-weight: 400; font-size: 10px; margin-left: 6px; } .readings article { border-bottom: 1px solid #e2e7e6; padding: 10px 0; display: grid; gap: 4px; }.readings article div { display: flex; justify-content: space-between; color: #667572; font-size: 11px; }.readings small, .readings p { color: #7a8784; font-size: 10px; }
    .readings footer { display: flex; align-items: center; gap: 7px; } .readings footer em { color: #5d6f6b; font-size: 10px; font-style: normal; } .readings footer mark { background: #f8efd9; color: #936d20; font-size: 10px; padding: 2px 6px; border-radius: 3px; }
    .status { padding: 3px 7px; background: #e7f3ee; color: #2e765a; border-radius: 3px; font-size: 11px; }.status.warning { background: #f8efd9; color: #936d20; }.status.danger { background: #fae8e6; color: #a43c35; }
    .thresholds { margin-top: 14px; padding: 16px; } .th-head h3 { margin: 0 0 4px; font-size: 15px; } .th-head p { margin: 0 0 12px; color: #72807d; font-size: 11px; }
    .th-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; } .th-grid section { border: 1px solid #e2e7e6; padding: 10px 12px; display: grid; gap: 4px; } .th-grid header { display: flex; justify-content: space-between; align-items: center; } .th-grid header b { font-size: 13px; } .th-grid header span { background: #e7f3ee; color: #2e765a; font-size: 10px; padding: 2px 7px; border-radius: 3px; } .th-grid p { margin: 0; font-size: 12px; } .th-grid small { color: #7a8784; font-size: 10px; } .th-grid details { font-size: 10px; color: #667572; } .th-grid summary { cursor: pointer; color: #315d6e; } .th-grid details div { padding: 3px 0; border-top: 1px dashed #e2e7e6; }
    .draft-form { display: grid; grid-template-columns: repeat(4, 1fr) auto; gap: 8px; align-items: center; border-top: 1px solid #e2e7e6; padding-top: 12px; } .draft-form .wide { grid-column: 1 / -2; } .draft-form button { grid-row: span 1; }
  `]
})
export class MonitoringPageComponent {
  private readonly store = inject(Store)
  keyword = ''
  readonly pointColumns = ['name', 'zone', 'type', 'value', 'status']
  readonly dataset$ = this.store.select(selectDataset)
  readonly notice$ = this.store.select(selectNotice)
  readonly filteredPoints$ = this.dataset$.pipe(map((dataset) => dataset.points.filter((point) => !this.keyword || `${point.name} ${point.zone} ${point.type} ${point.id}`.includes(this.keyword))))
  readonly readingRows$ = this.dataset$.pipe(map((dataset) => dataset.readings.map((reading) => {
    const verdict = dataset.verdicts.find((item) => item.readingId === reading.id && !item.superseded)
    const version = verdict ? dataset.thresholdVersions.find((item) => item.id === verdict.thresholdVersionId) : undefined
    return { ...reading, verdict, versionLabel: version ? `${version.thresholdId} V${version.version}` : '—' }
  })))
  readonly thresholdRows$ = this.dataset$.pipe(map((dataset) => dataset.thresholds.map((threshold) => ({
    threshold,
    active: dataset.thresholdVersions.find((version) => version.id === threshold.activeVersionId),
    history: dataset.thresholdVersions.filter((version) => version.thresholdId === threshold.id && version.status !== '已生效').sort((a, b) => b.version - a.version)
  }))))
  draft = { thresholdId: 'T-D', warning: 12, alarm: 18, changeRate: 2.5, note: '' }
  submitDraft(): void {
    this.store.dispatch(TailingsActions.submitThresholdDraft({
      thresholdId: this.draft.thresholdId,
      draft: { warning: Number(this.draft.warning), alarm: Number(this.draft.alarm), changeRate: Number(this.draft.changeRate), note: this.draft.note },
      operator: '值班员 王峰'
    }))
  }
}
