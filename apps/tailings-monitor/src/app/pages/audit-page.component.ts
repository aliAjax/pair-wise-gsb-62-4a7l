import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatTableModule } from '@angular/material/table'
import { Store } from '@ngrx/store'
import { combineLatest, map } from 'rxjs'
import type { ReviewPackage } from '../domain'
import { TailingsApiService } from '../services/tailings-api.service'
import { TailingsActions } from '../store/tailings.actions'
import { selectDataset, selectReviewPackage, selectReviewPackages } from '../store/tailings.selectors'

@Component({
  selector: 'app-audit-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatTableModule],
  template: `
    <section class="page">
      <div class="view-banner" *ngIf="pkg$ | async as pkg">
        <div><b>审阅包视图：{{ pkg.label }}</b><span>{{ pkg.id }} · 导出于 {{ pkg.exportedAt.replace('T', ' ').slice(0, 16) }} · 全部内容按包内固定阈值版本解释</span></div>
        <button mat-flat-button color="primary" (click)="downloadPackage(pkg.id)">下载JSON</button>
        <button mat-stroked-button (click)="closePackage()">关闭审阅包</button>
      </div>

      <div class="head"><div><h2>审计与版本追溯</h2><p>阈值冻结、重算受理/断点/固化、结论确认、方案审批、审阅包导出全部留痕。</p></div></div>

      <div class="export-bar panel">
        <mat-form-field appearance="outline" class="label-input"><mat-label>审阅包名称</mat-label><input matInput [(ngModel)]="packageLabel" placeholder="如：D01异常周报审阅包" /></mat-form-field>
        <button mat-flat-button color="primary" [disabled]="(pkg$ | async)" (click)="exportPackage()">导出审阅包（固定版本/关联/未完成重算）</button>
      </div>

      <h3>已导出审阅包</h3>
      <table mat-table [dataSource]="(packages$ | async) ?? []" class="panel">
        <ng-container matColumnDef="label"><th mat-header-cell *matHeaderCellDef>审阅包</th><td mat-cell *matCellDef="let row"><b>{{ row.label }}</b><small>{{ row.id }} · {{ row.exportedAt.replace('T', ' ').slice(0, 16) }} · {{ row.exportedBy }}</small></td></ng-container>
        <ng-container matColumnDef="versions"><th mat-header-cell *matHeaderCellDef>固定阈值版本</th><td mat-cell *matCellDef="let row"><span class="ver" *ngFor="let pin of row.pinnedThresholdVersions">{{ pin.versionId }}</span></td></ng-container>
        <ng-container matColumnDef="links"><th mat-header-cell *matHeaderCellDef>异常关联</th><td mat-cell *matCellDef="let row">{{ row.anomalyLinks.length }} 条 · 未完成重算 {{ row.unfinishedRecomputes.length }} 个</td></ng-container>
        <ng-container matColumnDef="open"><th mat-header-cell *matHeaderCellDef></th><td mat-cell *matCellDef="let row"><button mat-button color="primary" (click)="reopenPackage(row.id)">重新打开（按同一版本解释）</button><button mat-button (click)="downloadPackage(row.id)">下载</button></td></ng-container>
        <tr mat-header-row *matHeaderRowDef="packageColumns"></tr><tr mat-row *matRowDef="let row; columns: packageColumns" [class.opened]="(viewingId$ | async) === row.id"></tr>
      </table>

      <ng-container *ngIf="pkg$ | async as pkg">
        <h3>包内固定阈值版本</h3>
        <table mat-table [dataSource]="pkg.pinnedThresholdVersions" class="panel">
          <ng-container matColumnDef="type"><th mat-header-cell *matHeaderCellDef>类型</th><td mat-cell *matCellDef="let row">{{ row.thresholdType }}</td></ng-container>
          <ng-container matColumnDef="id"><th mat-header-cell *matHeaderCellDef>版本实例</th><td mat-cell *matCellDef="let row"><b>{{ row.versionId }}</b></td></ng-container>
          <ng-container matColumnDef="version"><th mat-header-cell *matHeaderCellDef>版本号</th><td mat-cell *matCellDef="let row">V{{ row.version }}</td></ng-container>
          <ng-container matColumnDef="status"><th mat-header-cell *matHeaderCellDef>导出时状态</th><td mat-cell *matCellDef="let row">{{ row.status }}</td></ng-container>
          <tr mat-header-row *matHeaderRowDef="pinColumns"></tr><tr mat-row *matRowDef="let row; columns: pinColumns"></tr>
        </table>

        <h3>异常关联（原判依据 / 当前依据 / 方案依据）</h3>
        <table mat-table [dataSource]="pkg.anomalyLinks" class="panel">
          <ng-container matColumnDef="anomaly"><th mat-header-cell *matHeaderCellDef>异常</th><td mat-cell *matCellDef="let row">{{ row.anomalyId }} · {{ row.pointId }} · 触发读数 {{ row.triggerReadingId }}</td></ng-container>
          <ng-container matColumnDef="basis"><th mat-header-cell *matHeaderCellDef>依据链</th><td mat-cell *matCellDef="let row"><small>原判 {{ row.originalBasisVersionId || '—' }} → 当前 {{ row.currentBasisVersionId }} → 方案 {{ row.planBasisVersionId }}</small><small *ngIf="row.conclusionVersionId">重算结论版本 {{ row.conclusionVersionId }}</small></td></ng-container>
          <ng-container matColumnDef="jobs"><th mat-header-cell *matHeaderCellDef>重算任务</th><td mat-cell *matCellDef="let row"><span class="ver" *ngFor="let job of row.jobIds">{{ job }}</span><span *ngIf="!row.jobIds.length">—</span></td></ng-container>
          <ng-container matColumnDef="hold"><th mat-header-cell *matHeaderCellDef>审批</th><td mat-cell *matCellDef="let row"><span class="pill" [class.held]="row.approvalHold">{{ row.approvalHold ? '暂停' : '正常' }}</span></td></ng-container>
          <tr mat-header-row *matHeaderRowDef="linkColumns"></tr><tr mat-row *matRowDef="let row; columns: linkColumns"></tr>
        </table>

        <h3>未完成重算</h3>
        <table mat-table [dataSource]="pkg.unfinishedRecomputes" class="panel">
          <ng-container matColumnDef="job"><th mat-header-cell *matHeaderCellDef>任务</th><td mat-cell *matCellDef="let row">{{ row.jobId }}</td></ng-container>
          <ng-container matColumnDef="target"><th mat-header-cell *matHeaderCellDef>目标版本</th><td mat-cell *matCellDef="let row">{{ row.targetVersionId }}</td></ng-container>
          <ng-container matColumnDef="progress"><th mat-header-cell *matHeaderCellDef>断点</th><td mat-cell *matCellDef="let row">{{ row.done }}/{{ row.total }}（受理 {{ row.attempts }} 次）</td></ng-container>
          <ng-container matColumnDef="status"><th mat-header-cell *matHeaderCellDef>状态</th><td mat-cell *matCellDef="let row">{{ row.status }}<small *ngIf="row.lastError">{{ row.lastError }}</small></td></ng-container>
          <tr mat-header-row *matHeaderRowDef="jobColumns"></tr><tr mat-row *matRowDef="let row; columns: jobColumns"></tr>
        </table>
        <p class="empty" *ngIf="!pkg.unfinishedRecomputes.length">导出时无未完成重算。</p>
      </ng-container>

      <h3>审计时间线</h3>
      <div class="toolbar"><mat-form-field appearance="outline"><mat-label>搜索实体、动作、操作人</mat-label><input matInput [(ngModel)]="keyword" /></mat-form-field><span>共{{ (filtered$ | async)?.length }}条事件</span></div>
      <table mat-table [dataSource]="filtered$ | async" class="panel">
        <ng-container matColumnDef="time"><th mat-header-cell *matHeaderCellDef>时间</th><td mat-cell *matCellDef="let row">{{ row.createdAt.replace('T', ' ').slice(0, 16) }}</td></ng-container>
        <ng-container matColumnDef="entity"><th mat-header-cell *matHeaderCellDef>实体</th><td mat-cell *matCellDef="let row">{{ row.entityId }}</td></ng-container>
        <ng-container matColumnDef="action"><th mat-header-cell *matHeaderCellDef>动作</th><td mat-cell *matCellDef="let row"><span class="action-tag">{{ row.action }}</span></td></ng-container>
        <ng-container matColumnDef="operator"><th mat-header-cell *matHeaderCellDef>操作人</th><td mat-cell *matCellDef="let row">{{ row.operator }}</td></ng-container>
        <ng-container matColumnDef="detail"><th mat-header-cell *matHeaderCellDef>说明</th><td mat-cell *matCellDef="let row">{{ row.detail }}</td></ng-container>
        <tr mat-header-row *matHeaderRowDef="columns"></tr><tr mat-row *matRowDef="let row; columns: columns"></tr>
      </table>
    </section>
  `,
  styles: [`
    .page { padding: 22px 28px 45px; }.head h2 { margin: 0 0 5px; font-size: 20px; }.head p { margin: 0 0 14px; color: #72807d; font-size: 12px; }
    .view-banner { display: flex; align-items: center; gap: 12px; background: #274852; color: white; padding: 12px 16px; margin-bottom: 14px; }.view-banner div { flex: 1; }.view-banner b { font-size: 14px; }.view-banner span { display: block; color: #b7cbd1; font-size: 11px; margin-top: 3px; }
    .export-bar { display: flex; gap: 12px; align-items: center; padding: 12px 14px; margin-bottom: 16px; }.label-input { flex: 1; margin: 0; }
    h3 { font-size: 14px; margin: 18px 0 8px; }.toolbar { display: flex; align-items: center; gap: 12px; margin: 8px 0; }.toolbar span { color: #72807d; font-size: 11px; }
    .panel { width: 100%; background: white; border: 1px solid #d9e1df; margin-bottom: 6px; } td small { display: block; color: #8a9693; font-size: 10px; margin-top: 2px; }
    .ver { display: inline-block; background: #eef4f3; color: #315d6e; border-radius: 3px; padding: 1px 6px; font-size: 10px; margin: 1px 4px 1px 0; }
    .pill { padding: 2px 8px; border-radius: 10px; background: #e4f1ea; color: #2e765a; font-size: 10px; }.pill.held { background: #fae8e6; color: #a43c35; }
    tr.opened { background: #eef5f4; } .action-tag { font-size: 11px; color: #2a5363; }
    .empty { color: #98a4a0; font-size: 11px; }
  `]
})
export class AuditPageComponent {
  private readonly store = inject(Store)
  private readonly api = inject(TailingsApiService)
  keyword = ''
  packageLabel = ''
  readonly columns = ['time', 'entity', 'action', 'operator', 'detail']
  readonly packageColumns = ['label', 'versions', 'links', 'open']
  readonly pinColumns = ['type', 'id', 'version', 'status']
  readonly linkColumns = ['anomaly', 'basis', 'jobs', 'hold']
  readonly jobColumns = ['job', 'target', 'progress', 'status']

  private readonly dataset$ = this.store.select(selectDataset)
  readonly packages$ = this.store.select(selectReviewPackages)
  readonly pkg$ = this.store.select(selectReviewPackage)
  readonly viewingId$ = this.pkg$.pipe(map((pkg) => pkg?.id ?? ''))
  readonly filtered$ = combineLatest([this.dataset$, this.pkg$]).pipe(map(([dataset, pkg]) => {
    const audit = pkg ? pkg.dataset.audit : dataset.audit
    return audit.filter((item) => !this.keyword || `${item.entityId} ${item.action} ${item.operator} ${item.detail}`.includes(this.keyword))
  }))

  exportPackage(): void {
    this.store.dispatch(TailingsActions.exportReviewPackage({ label: this.packageLabel }))
    this.packageLabel = ''
  }
  reopenPackage(packageId: string): void { this.store.dispatch(TailingsActions.reopenReviewPackage({ packageId })) }
  closePackage(): void { this.store.dispatch(TailingsActions.closeReviewPackage()) }
  downloadPackage(packageId: string): void {
    let pkg: ReviewPackage | undefined
    this.packages$.subscribe((items) => { pkg = items.find((item) => item.id === packageId) }).unsubscribe()
    if (!pkg) return
    this.api.exportPackage(pkg).subscribe((blob) => {
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `尾矿库审阅包-${packageId}.json`
      anchor.click()
      URL.revokeObjectURL(url)
    })
  }
}
