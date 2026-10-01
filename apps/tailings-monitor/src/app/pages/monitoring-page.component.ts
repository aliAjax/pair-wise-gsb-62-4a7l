import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatTableModule } from '@angular/material/table'
import { Store } from '@ngrx/store'
import { map } from 'rxjs'
import { PackageBannerComponent } from '../components/package-banner.component'
import { selectDataset } from '../store/tailings.selectors'

@Component({
  selector: 'app-monitoring-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatInputModule, MatTableModule, PackageBannerComponent],
  template: `
    <section class="page">
      <app-package-banner />
      <div class="page-head"><div><h2>测点与原始读数</h2><p>原始读数只读；评判记录同时保留原判依据和当前依据，阈值更新后旧读数“保留原判、进入待重算”。</p></div><mat-form-field appearance="outline"><mat-label>搜索测点</mat-label><input matInput [(ngModel)]="keyword" /></mat-form-field></div>
      <div class="split">
        <div class="panel">
          <table mat-table [dataSource]="rows$ | async">
            <ng-container matColumnDef="point"><th mat-header-cell *matHeaderCellDef>测点 / 读数</th><td mat-cell *matCellDef="let row"><b>{{ row.pointName }}</b><small>{{ row.readingId }} · {{ row.reading.capturedAt.replace('T', ' ').slice(0, 16) }} · {{ row.reading.deviceId }}</small></td></ng-container>
            <ng-container matColumnDef="value"><th mat-header-cell *matHeaderCellDef>读数</th><td mat-cell *matCellDef="let row"><strong>{{ row.reading.value }} {{ row.reading.unit }}</strong><small>{{ row.reading.quality }}</small></td></ng-container>
            <ng-container matColumnDef="original"><th mat-header-cell *matHeaderCellDef>原判（冻结依据）</th><td mat-cell *matCellDef="let row"><span class="verdict" [class.danger]="row.originalVerdict === '异常'" [class.warning]="row.originalVerdict === '预警'">{{ row.originalVerdict }}</span><small>{{ row.evaluation?.originalBasisVersionId || '—' }}</small></td></ng-container>
            <ng-container matColumnDef="current"><th mat-header-cell *matHeaderCellDef>当前依据</th><td mat-cell *matCellDef="let row"><span class="verdict" [class.danger]="row.currentVerdict === '异常'" [class.warning]="row.currentVerdict === '预警'">{{ row.currentVerdict }}</span><small>{{ row.evaluation?.basisVersionId || '—' }}</small></td></ng-container>
            <ng-container matColumnDef="recompute"><th mat-header-cell *matHeaderCellDef>重算状态</th><td mat-cell *matCellDef="let row"><span class="pill" [class.pending]="row.evaluation?.recomputeStatus === '待重算'" [class.done]="row.evaluation?.recomputeStatus === '已重算'" [class.running]="row.evaluation?.recomputeStatus === '重算中'">{{ row.evaluation?.recomputeStatus || '无评判' }}</span></td></ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr><tr mat-row *matRowDef="let row; columns: columns"></tr>
          </table>
        </div>
        <div class="panel readings">
          <h3>依据版本说明</h3>
          <article><div><b>原判保留</b><span>不可覆盖</span></div><p>读数采集时的判定及阈值版本永久保留，历史异常始终能回答“当时按什么值判的”。</p></article>
          <article><div><b>待重算</b><span>范围已冻结</span></div><p>阈值新版本冻结时圈定的读数进入待重算，期间展示的仍是原判，不提前按新值或旧任务结果解释。</p></article>
          <article><div><b>已重算</b><span>仅更新当前依据</span></div><p>重算固化后当前判定换为新版本，原判仍在；测点状态随当前判定同步。</p></article>
          <p class="foot">设备读数写入后不可修改；人工复核只形成新的评估版本。</p>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .page { padding: 22px 28px 45px; }.page-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }.page-head h2 { margin: 0 0 5px; font-size: 20px; }.page-head p { margin: 0; color: #72807d; font-size: 12px; }
    .split { display: grid; grid-template-columns: 1fr 330px; gap: 14px; align-items: start; }.panel { background: white; border: 1px solid #d9e1df; } table { width: 100%; }
    td small { display: block; color: #8a9693; font-size: 10px; margin-top: 2px; }
    .verdict { padding: 2px 8px; border-radius: 3px; background: #e9f1ee; color: #336557; font-size: 11px; } .verdict.warning { background: #f8efd9; color: #936d20; } .verdict.danger { background: #fae8e6; color: #a43c35; }
    .pill { padding: 2px 8px; border-radius: 10px; background: #ecefe9; color: #6f7a75; font-size: 10px; white-space: nowrap; } .pill.pending { background: #fdf3dc; color: #92691c; } .pill.done { background: #e4f1ea; color: #2e765a; } .pill.running { background: #e2edf7; color: #2d5f8c; }
    .readings { padding: 15px; } .readings h3 { font-size: 14px; margin: 0 0 12px; } .readings article { border-bottom: 1px solid #e2e7e6; padding: 10px 0; display: grid; gap: 4px; }.readings article div { display: flex; justify-content: space-between; color: #50615d; font-size: 11px; }.readings article div span { color: #98a4a0; font-size: 10px; }.readings p { margin: 0; color: #72807d; font-size: 11px; }.readings .foot { color: #7a8784; font-size: 10px; margin-top: 12px; }
  `]
})
export class MonitoringPageComponent {
  private readonly store = inject(Store)
  keyword = ''
  readonly columns = ['point', 'value', 'original', 'current', 'recompute']
  readonly rows$ = this.store.select(selectDataset).pipe(map((dataset) => {
    const pointName = (pointId: string) => dataset.points.find((point) => point.id === pointId)?.name ?? pointId
    return dataset.readings
      .filter((reading) => {
        const point = dataset.points.find((item) => item.id === reading.pointId)
        return !this.keyword || `${point?.name ?? ''} ${reading.pointId} ${reading.deviceId}`.includes(this.keyword)
      })
      .map((reading) => {
        const evaluation = dataset.evaluations.find((item) => item.readingId === reading.id)
        return { reading, pointName: pointName(reading.pointId), readingId: reading.id, evaluation, originalVerdict: evaluation?.originalVerdict ?? '—', currentVerdict: evaluation?.currentVerdict ?? '—' }
      })
  }))
}
