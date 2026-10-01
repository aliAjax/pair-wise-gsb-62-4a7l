import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatTableModule } from '@angular/material/table'
import { Store } from '@ngrx/store'
import { map } from 'rxjs'
import type { ReviewPackage } from '../domain'
import { TailingsApiService } from '../services/tailings-api.service'
import { TailingsActions } from '../store/tailings.actions'
import { selectAnomalies, selectDataset, selectNotice, selectReviewPackages } from '../store/tailings.selectors'

@Component({
  selector: 'app-audit-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatTableModule],
  template: `
    <section class="page">
      <div class="head"><div><h2>审计与版本追溯</h2><p>阈值冻结、重算受理与断点、批准暂停与确认、审阅包固定版本，全部留痕。</p></div><button mat-flat-button color="primary" (click)="buildPackage()">生成审阅包</button></div>
      <div class="notice" *ngIf="notice$ | async as notice">{{ notice }}</div>
      <div class="split">
        <div class="panel jobs">
          <h3>重算任务台账</h3>
          <table mat-table [dataSource]="jobRows$ | async">
            <ng-container matColumnDef="job"><th mat-header-cell *matHeaderCellDef>任务</th><td mat-cell *matCellDef="let row"><b>{{ row.job.id }}</b><small class="sub">{{ row.job.anomalyId || row.job.pointId }}</small></td></ng-container>
            <ng-container matColumnDef="range"><th mat-header-cell *matHeaderCellDef>版本</th><td mat-cell *matCellDef="let row">{{ row.baseLabel }} → {{ row.targetLabel }}</td></ng-container>
            <ng-container matColumnDef="progress"><th mat-header-cell *matHeaderCellDef>断点</th><td mat-cell *matCellDef="let row">{{ row.job.processedReadingIds.length }}/{{ row.job.scopeReadingIds.length }} 条 · 第{{ row.job.attempts }}次</td></ng-container>
            <ng-container matColumnDef="status"><th mat-header-cell *matHeaderCellDef>状态</th><td mat-cell *matCellDef="let row"><span class="job-status" [class.failed]="row.job.status === '失败'" [class.done]="row.job.status === '已完成'">{{ row.job.status }}</span><small class="sub" *ngIf="row.job.lastError">{{ row.job.lastError }}</small></td></ng-container>
            <tr mat-header-row *matHeaderRowDef="jobColumns"></tr><tr mat-row *matRowDef="let row; columns: jobColumns"></tr>
          </table>
          <p class="empty" *ngIf="!(jobRows$ | async)?.length">暂无重算任务。提交阈值草稿后自动受理。</p>
        </div>
        <div class="panel packages">
          <h3>审阅包 <small>固定阈值版本 · 异常关联 · 未完成重算</small></h3>
          <article *ngFor="let pkg of packages$ | async" (click)="selectPackage(pkg.id)" [class.active]="selectedPackageId === pkg.id">
            <b>{{ pkg.id }}</b>
            <span>{{ pkg.createdAt.replace('T', ' ').slice(0, 19) }} · {{ pkg.createdBy }}</span>
            <small>固定版本 {{ pkg.pinnedVersions.length }} · 异常 {{ pkg.entries.length }} · 未完成重算 {{ pkg.openRecalcJobs.length }}</small>
          </article>
          <p class="empty" *ngIf="!(packages$ | async)?.length">尚无审阅包。点击“生成审阅包”打包未关闭异常。</p>
        </div>
      </div>
      <div class="panel package-detail" *ngIf="selectedPackage$ | async as pkg">
        <div class="pkg-head"><div><h3>{{ pkg.id }} · 按固定版本解释</h3><p>重新打开仍按打包时的判据版本解释，不随后续阈值更新漂移。</p></div><button mat-flat-button color="primary" (click)="exportPackage(pkg)">导出审阅包 JSON</button></div>
        <div class="pinned"><span>固定阈值版本：</span><em *ngFor="let v of pkg.pinnedVersions">{{ v.thresholdId }} V{{ v.version }}（预警{{ v.warning }}/报警{{ v.alarm }}{{ v.unit }}）</em></div>
        <table mat-table [dataSource]="pkg.entries">
          <ng-container matColumnDef="anomaly"><th mat-header-cell *matHeaderCellDef>异常</th><td mat-cell *matCellDef="let row"><b>{{ row.title }}</b><small class="sub">{{ row.anomalyId }} · {{ row.pointId }} · {{ row.status }}</small></td></ng-container>
          <ng-container matColumnDef="basis"><th mat-header-cell *matHeaderCellDef>判据版本</th><td mat-cell *matCellDef="let row">V{{ row.basisVersion }}</td></ng-container>
          <ng-container matColumnDef="verdict"><th mat-header-cell *matHeaderCellDef>解释</th><td mat-cell *matCellDef="let row"><span class="job-status" [class.failed]="row.verdict === '异常'" [class.done]="row.verdict === '正常'">{{ row.verdict || '未知' }}</span><small class="sub">{{ row.summary }}</small></td></ng-container>
          <tr mat-header-row *matHeaderRowDef="entryColumns"></tr><tr mat-row *matRowDef="let row; columns: entryColumns"></tr>
        </table>
        <div class="open-jobs" *ngIf="pkg.openRecalcJobs.length">
          <span>未完成重算：</span>
          <em *ngFor="let job of pkg.openRecalcJobs">{{ job.jobId }}（{{ job.anomalyId || job.pointId }} · {{ job.status }} · 断点{{ job.processed }}/{{ job.total }}）</em>
        </div>
      </div>
      <div class="toolbar"><mat-form-field appearance="outline"><mat-label>搜索实体、动作、操作人</mat-label><input matInput [(ngModel)]="keyword" /></mat-form-field><span>共{{ (filtered$ | async)?.length }}条事件</span></div>
      <table mat-table [dataSource]="filtered$ | async" class="panel">
        <ng-container matColumnDef="time"><th mat-header-cell *matHeaderCellDef>时间</th><td mat-cell *matCellDef="let row">{{ row.createdAt.replace('T', ' ').slice(0, 16) }}</td></ng-container>
        <ng-container matColumnDef="entity"><th mat-header-cell *matHeaderCellDef>实体</th><td mat-cell *matCellDef="let row">{{ row.entityId }}</td></ng-container>
        <ng-container matColumnDef="action"><th mat-header-cell *matHeaderCellDef>动作</th><td mat-cell *matCellDef="let row">{{ row.action }}</td></ng-container>
        <ng-container matColumnDef="operator"><th mat-header-cell *matHeaderCellDef>操作人</th><td mat-cell *matCellDef="let row">{{ row.operator }}</td></ng-container>
        <ng-container matColumnDef="detail"><th mat-header-cell *matHeaderCellDef>说明</th><td mat-cell *matCellDef="let row">{{ row.detail }}</td></ng-container>
        <tr mat-header-row *matHeaderRowDef="columns"></tr><tr mat-row *matRowDef="let row; columns: columns"></tr>
      </table>
    </section>
  `,
  styles: [`
    .page { padding: 22px 28px 45px; }.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }.head h2 { margin: 0 0 5px; font-size: 20px; }.head p { margin: 0; color: #72807d; font-size: 12px; }
    .notice { background: #fae8e6; color: #a43c35; border-left: 3px solid #a43c35; padding: 9px 12px; font-size: 12px; margin-bottom: 12px; }
    .split { display: grid; grid-template-columns: 1fr 360px; gap: 14px; align-items: start; margin-bottom: 14px; }
    .panel { background: white; border: 1px solid #d9e1df; } table { width: 100%; }
    .jobs, .packages { padding: 15px; } .jobs h3, .packages h3 { font-size: 14px; margin: 0 0 12px; } .packages h3 small { color: #8b9895; font-weight: 400; font-size: 10px; margin-left: 6px; }
    .sub { display: block; color: #7c8986; font-size: 10px; margin-top: 3px; }
    .job-status { background: #e8eef5; color: #315d6e; padding: 2px 8px; border-radius: 3px; font-size: 10px; }.job-status.failed { background: #fae8e6; color: #a43c35; }.job-status.done { background: #e7f3ee; color: #2e765a; }
    .empty { color: #8b9895; font-size: 11px; }
    .packages article { border: 1px solid #e2e7e6; padding: 10px 12px; margin-bottom: 8px; display: grid; gap: 3px; cursor: pointer; } .packages article.active { border-color: #315d6e; background: #eef5f4; } .packages article b { font-size: 12px; } .packages article span, .packages article small { color: #72807d; font-size: 10px; }
    .package-detail { padding: 15px; margin-bottom: 14px; } .pkg-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; } .pkg-head h3 { margin: 0 0 4px; font-size: 14px; } .pkg-head p { margin: 0; color: #72807d; font-size: 11px; }
    .pinned, .open-jobs { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 10px; font-size: 11px; color: #45564f; } .pinned em, .open-jobs em { font-style: normal; background: #e8eef5; color: #315d6e; padding: 2px 8px; border-radius: 3px; font-size: 10px; } .open-jobs em { background: #f8efd9; color: #936d20; }
    .toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }.toolbar span { color: #74827f; font-size: 11px; }
  `]
})
export class AuditPageComponent {
  private readonly store = inject(Store)
  private readonly api = inject(TailingsApiService)
  keyword = ''
  selectedPackageId = ''
  readonly columns = ['time', 'entity', 'action', 'operator', 'detail']
  readonly jobColumns = ['job', 'range', 'progress', 'status']
  readonly entryColumns = ['anomaly', 'basis', 'verdict']
  readonly dataset$ = this.store.select(selectDataset)
  readonly notice$ = this.store.select(selectNotice)
  readonly filtered$ = this.dataset$.pipe(map((dataset) => dataset.audit.filter((item) => !this.keyword || `${item.entityId} ${item.action} ${item.operator} ${item.detail}`.includes(this.keyword))))
  readonly jobRows$ = this.dataset$.pipe(map((dataset) => dataset.recalcJobs.map((job) => ({
    job,
    baseLabel: this.versionLabel(dataset, job.baseVersionId),
    targetLabel: this.versionLabel(dataset, job.targetVersionId)
  }))))
  readonly packages$ = this.store.select(selectReviewPackages)
  readonly selectedPackage$ = this.store.select(selectReviewPackages).pipe(map((packages) => packages.find((pkg) => pkg.id === this.selectedPackageId) ?? packages[0]))
  versionLabel(dataset: { thresholdVersions: { id: string; thresholdId: string; version: number }[] }, versionId: string): string {
    const version = dataset.thresholdVersions.find((item) => item.id === versionId)
    return version ? `${version.thresholdId} V${version.version}` : '—'
  }
  selectPackage(id: string): void { this.selectedPackageId = id }
  buildPackage(): void {
    let ids: string[] = []
    this.store.select(selectAnomalies).subscribe((anomalies) => { ids = anomalies.filter((item) => item.status !== '已关闭').map((item) => item.id) }).unsubscribe()
    this.store.dispatch(TailingsActions.buildReviewPackage({ anomalyIds: ids, operator: '负责人 何清' }))
    this.store.select(selectReviewPackages).subscribe((packages) => { this.selectedPackageId = packages[0]?.id ?? '' }).unsubscribe()
  }
  exportPackage(pkg: ReviewPackage): void {
    this.api.exportPackage(pkg).subscribe((blob) => {
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `审阅包-${pkg.id}.json`; anchor.click(); URL.revokeObjectURL(url)
    })
  }
}
