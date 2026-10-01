import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatSelectModule } from '@angular/material/select'
import { MatTableModule } from '@angular/material/table'
import { Store } from '@ngrx/store'
import type { Anomaly, DispositionPlan, ExpertOpinion, FieldReview, RecalcJob, TailingsDataset } from '../domain'
import { TailingsActions } from '../store/tailings.actions'
import { selectAnomalies, selectDataset, selectFilteredAnomalies, selectNotice, selectSelectedAnomaly } from '../store/tailings.selectors'

@Component({
  selector: 'app-anomaly-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatTableModule],
  template: `
    <section class="page">
      <div class="metrics">
        <article><span>待现场复核</span><strong>{{ count('待现场复核') }}</strong><small>不得直接关闭</small></article>
        <article><span>调查与审批</span><strong>{{ count('原因调查中') + count('待负责人审批') }}</strong><small>多专业意见并存</small></article>
        <article><span>应急联动</span><strong>{{ count('应急联动') }}</strong><small>重大异常强制联动</small></article>
        <article><span>已关闭</span><strong>{{ count('已关闭') }}</strong><small>具备复测与签批</small></article>
      </div>
      <div class="notice" *ngIf="notice$ | async as notice">{{ notice }}</div>
      <div class="toolbar"><mat-form-field appearance="outline"><mat-label>搜索异常</mat-label><input matInput [(ngModel)]="localKeyword" (ngModelChange)="updateKeyword($event)" /></mat-form-field><mat-form-field appearance="outline"><mat-label>状态</mat-label><mat-select [(ngModel)]="localStatus" (ngModelChange)="updateStatus($event)"><mat-option value="全部">全部</mat-option><mat-option *ngFor="let item of statuses" [value]="item">{{ item }}</mat-option></mat-select></mat-form-field></div>
      <div class="split" *ngIf="dataset$ | async as dataset">
        <table mat-table [dataSource]="filtered$ | async" class="panel">
          <ng-container matColumnDef="title"><th mat-header-cell *matHeaderCellDef>异常</th><td mat-cell *matCellDef="let row"><b>{{ row.title }}</b><small class="sub">{{ row.id }} · {{ row.pointId }}</small></td></ng-container>
          <ng-container matColumnDef="severity"><th mat-header-cell *matHeaderCellDef>级别</th><td mat-cell *matCellDef="let row"><span class="severity" [class.major]="row.severity === '重大'">{{ row.severity }}</span></td></ng-container>
          <ng-container matColumnDef="status"><th mat-header-cell *matHeaderCellDef>状态</th><td mat-cell *matCellDef="let row">{{ row.status }}</td></ng-container>
          <ng-container matColumnDef="basis"><th mat-header-cell *matHeaderCellDef>判据</th><td mat-cell *matCellDef="let row"><span class="basis">{{ versionLabel(dataset, row.basisVersionId) }}</span><small class="sub" *ngIf="row.recalcState !== '无需重算'">{{ row.recalcState }}</small></td></ng-container>
          <ng-container matColumnDef="open"><th mat-header-cell *matHeaderCellDef></th><td mat-cell *matCellDef="let row"><button mat-button (click)="select(row.id)">审阅</button></td></ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr><tr mat-row *matRowDef="let row; columns: columns" [class.selected]="row.id === (selected$ | async)?.id"></tr>
        </table>
        <div class="panel detail" *ngIf="selected$ | async as selected">
          <div class="detail-head"><div><span>{{ selected.id }} · V{{ selected.version }}</span><h2>{{ selected.title }}</h2><p>{{ selected.observedValue }}</p></div><span class="severity" [class.major]="selected.severity === '重大'">{{ selected.severity }}</span></div>
          <div class="basis-band">
            <span>判据版本 <b>{{ versionLabel(dataset, selected.basisVersionId) }}</b></span>
            <em [class.stale]="selected.recalcState === '待重算' || selected.recalcState === '重算中'">{{ selected.recalcState }}</em>
          </div>
          <div class="recalc-card" *ngIf="jobFor(dataset, selected.id) as job">
            <header><b>重算任务 {{ job.id }}</b><span class="job-status" [class.failed]="job.status === '失败'" [class.done]="job.status === '已完成'">{{ job.status }}</span></header>
            <p>范围 {{ job.scopeReadingIds.length }} 条读数 · 断点 {{ job.processedReadingIds.length }}/{{ job.scopeReadingIds.length }} · {{ versionLabel(dataset, job.baseVersionId) }} → {{ versionLabel(dataset, job.targetVersionId) }} · 第 {{ job.attempts }} 次尝试</p>
            <div class="progress"><i [style.width.%]="progress(job)"></i></div>
            <p class="error" *ngIf="job.lastError">{{ job.lastError }}</p>
            <div class="recalc-actions">
              <button mat-button (click)="requestRecalc(selected)">发起重算</button>
              <button mat-button color="warn" *ngIf="job.status === '进行中'" (click)="interrupt(job)">模拟中断</button>
              <button mat-flat-button color="primary" *ngIf="job.status === '失败'" (click)="resume(job)">断点恢复</button>
            </div>
          </div>
          <div class="recalc-card empty" *ngIf="!jobFor(dataset, selected.id)">
            <p>暂无重算任务。阈值更新会自动受理；重复发起将被去重拒绝并留痕。</p>
            <button mat-button (click)="requestRecalc(selected)">发起重算</button>
          </div>
          <h3>现场复核</h3>
          <div class="review-form"><mat-form-field appearance="outline" class="wide"><mat-label>现场观察</mat-label><textarea matInput rows="2" [(ngModel)]="fieldForm.observed"></textarea></mat-form-field><mat-form-field appearance="outline"><mat-label>证据清单</mat-label><input matInput [(ngModel)]="fieldForm.evidence" /></mat-form-field><mat-form-field appearance="outline"><mat-label>重新评估</mat-label><input matInput [(ngModel)]="fieldForm.reassessment" /></mat-form-field><button mat-flat-button color="primary" (click)="submitReview(selected)">提交复核版本</button></div>
          <div class="records" *ngFor="let review of selected.fieldReviews"><b>{{ review.inspector }} · V{{ review.version }}</b><p>{{ review.observed }}</p><span>{{ review.reassessment }} · {{ review.evidence }}</span></div>
          <h3>专业意见</h3>
          <div class="opinion-form"><mat-form-field appearance="outline"><mat-label>专业</mat-label><mat-select [(ngModel)]="opinionForm.discipline"><mat-option *ngFor="let item of disciplines" [value]="item">{{ item }}</mat-option></mat-select></mat-form-field><mat-form-field appearance="outline" class="wide"><mat-label>意见</mat-label><input matInput [(ngModel)]="opinionForm.content" /></mat-form-field><button mat-button (click)="addOpinion(selected)">补充意见</button></div>
          <div class="opinions"><article *ngFor="let opinion of selected.opinions"><b>{{ opinion.discipline }}专家 {{ opinion.specialist }}</b><span>{{ opinion.conclusion }}</span><p>{{ opinion.content }}</p></article></div>
          <h3>处置方案与会签</h3>
          <div class="plan-form"><mat-form-field appearance="outline"><mat-label>措施</mat-label><mat-select [(ngModel)]="planForm.action"><mat-option *ngFor="let item of actions" [value]="item">{{ item }}</mat-option></mat-select></mat-form-field><mat-form-field appearance="outline"><mat-label>责任方</mat-label><input matInput [(ngModel)]="planForm.owner" /></mat-form-field><mat-form-field appearance="outline" class="wide"><mat-label>关闭条件</mat-label><textarea matInput rows="2" [(ngModel)]="planForm.conditions"></textarea></mat-form-field><mat-form-field appearance="outline"><mat-label>截止</mat-label><input matInput type="datetime-local" [(ngModel)]="planForm.deadline" /></mat-form-field><button mat-button (click)="savePlan(selected)">提交审批</button></div>
          <div class="hold-band" *ngIf="selected.plan.approvalHold">
            <b>已暂停批准</b><span>{{ selected.plan.holdReason }}</span>
            <button mat-flat-button color="primary" (click)="confirmBasis(selected)">负责人确认继续</button>
          </div>
          <div class="approval-band">
            <div><b>{{ selected.plan.approvedBy || '尚未审批' }}</b><span>方案依据 {{ versionLabel(dataset, selected.plan.basisVersionId) }}<ng-container *ngIf="selected.plan.confirmedBy"> · {{ selected.plan.confirmedBy }}已确认继续</ng-container></span><span>{{ selected.plan.conditions }}</span></div>
            <button mat-flat-button color="primary" [disabled]="approveDisabled(dataset, selected)" (click)="approve(selected)">负责人审批</button><button mat-button color="warn" (click)="emergency(selected)">应急联动</button><button mat-button [disabled]="selected.status !== '待负责人审批'" (click)="close(selected)">关闭异常</button>
          </div>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .page { padding: 22px 28px 45px; }.metrics { display: grid; grid-template-columns: repeat(4, 1fr); background: white; border: 1px solid #d9e1df; margin-bottom: 14px; }.metrics article { padding: 16px 18px; border-right: 1px solid #e2e7e6; }.metrics article:last-child { border: 0; }.metrics span, .metrics strong, .metrics small { display: block; }.metrics span { color: #72807d; font-size: 12px; }.metrics strong { font-size: 26px; color: #245060; margin: 6px 0; }.metrics small { color: #98a4a0; font-size: 10px; }
    .notice { background: #fae8e6; color: #a43c35; border-left: 3px solid #a43c35; padding: 9px 12px; font-size: 12px; margin-bottom: 12px; }
    .toolbar { display: flex; gap: 10px; margin-bottom: 10px; }.split { display: grid; grid-template-columns: minmax(600px,1fr) 520px; gap: 14px; align-items: start; }.panel { background: white; border: 1px solid #d9e1df; } table { width: 100%; }.selected { background: #eef5f4; }.sub { display: block; color: #7c8986; font-size: 10px; margin-top: 3px; }.severity { padding: 3px 7px; border-radius: 3px; background: #f7edd6; color: #8e681d; font-size: 11px; }.severity.major { background: #fae7e5; color: #a23b34; }
    .basis { background: #e8eef5; color: #315d6e; padding: 2px 7px; border-radius: 3px; font-size: 10px; }
    .detail { padding: 16px; }.detail-head { display: flex; justify-content: space-between; align-items: start; border-bottom: 1px solid #e1e6e5; padding-bottom: 12px; }.detail-head span { color: #74827f; font-size: 10px; }.detail-head h2 { margin: 4px 0; font-size: 18px; }.detail-head p { margin: 0; color: #65736f; font-size: 12px; }.detail h3 { font-size: 13px; margin: 16px 0 8px; }
    .basis-band { display: flex; justify-content: space-between; align-items: center; background: #eef3f6; border-left: 3px solid #315d6e; padding: 8px 10px; margin-top: 10px; font-size: 11px; color: #45564f; }.basis-band b { color: #245060; }.basis-band em { font-style: normal; background: #e7f3ee; color: #2e765a; padding: 2px 8px; border-radius: 3px; font-size: 10px; }.basis-band em.stale { background: #f8efd9; color: #936d20; }
    .recalc-card { border: 1px solid #d9e1df; border-left: 3px solid #c99f3d; padding: 10px 12px; margin-top: 10px; display: grid; gap: 6px; }.recalc-card.empty { border-left-color: #b9c6c3; color: #72807d; font-size: 11px; }.recalc-card header { display: flex; justify-content: space-between; align-items: center; font-size: 12px; }.recalc-card p { margin: 0; color: #65736f; font-size: 11px; }.recalc-card .error { color: #a43c35; }
    .job-status { background: #e8eef5; color: #315d6e; padding: 2px 8px; border-radius: 3px; font-size: 10px; }.job-status.failed { background: #fae8e6; color: #a43c35; }.job-status.done { background: #e7f3ee; color: #2e765a; }
    .progress { height: 6px; background: #edf1f0; border-radius: 3px; overflow: hidden; }.progress i { display: block; height: 100%; background: #315d6e; }
    .recalc-actions { display: flex; gap: 8px; }
    .review-form, .opinion-form, .plan-form { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }.review-form .wide, .opinion-form .wide, .plan-form .wide { grid-column: 1 / -1; }.review-form button, .plan-form button { align-self: center; }.records { border-left: 3px solid #315d6e; background: #f5f8f7; padding: 9px; margin-top: 7px; display: grid; gap: 4px; }.records p { margin: 0; font-size: 12px; }.records span { color: #72807d; font-size: 10px; }
    .opinions article { border-bottom: 1px solid #e2e7e6; padding: 9px 0; display: grid; grid-template-columns: 1fr auto; gap: 4px; }.opinions p { grid-column: 1 / -1; margin: 0; font-size: 12px; }.opinions span { color: #8a6720; font-size: 10px; }
    .hold-band { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px; background: #fae8e6; border-left: 3px solid #a43c35; padding: 10px; margin-top: 12px; }.hold-band b { color: #a43c35; font-size: 12px; }.hold-band span { color: #7c4a45; font-size: 11px; }
    .approval-band { display: grid; grid-template-columns: 1fr auto auto auto; align-items: center; gap: 7px; background: #f6f0df; border-left: 3px solid #c99f3d; padding: 10px; margin-top: 12px; }.approval-band b, .approval-band span { display: block; }.approval-band span { color: #746c55; font-size: 10px; margin-top: 4px; }
  `]
})
export class AnomalyPageComponent {
  private readonly store = inject(Store)
  readonly filtered$ = this.store.select(selectFilteredAnomalies)
  readonly selected$ = this.store.select(selectSelectedAnomaly)
  readonly all$ = this.store.select(selectAnomalies)
  readonly dataset$ = this.store.select(selectDataset)
  readonly notice$ = this.store.select(selectNotice)
  readonly columns = ['title', 'severity', 'status', 'basis', 'open']
  readonly statuses: Anomaly['status'][] = ['待现场复核', '原因调查中', '待负责人审批', '应急联动', '已关闭']
  readonly disciplines: ExpertOpinion['discipline'][] = ['坝体', '水文', '岩土', '应急']
  readonly actions: DispositionPlan['action'][] = ['加密监测', '降低库水位', '疏通排水', '应急撤离准备', '工程加固']
  localKeyword = ''
  localStatus: Anomaly['status'] | '全部' = '全部'
  fieldForm = { observed: '', evidence: '', reassessment: '' }
  opinionForm = { discipline: '坝体' as ExpertOpinion['discipline'], content: '' }
  planForm = { action: '加密监测' as DispositionPlan['action'], owner: '坝体安全组', conditions: '', deadline: '2026-09-29T18:00' }
  count(status: Anomaly['status']): number { let value = 0; this.all$.subscribe((items) => { value = items.filter((item) => item.status === status).length }).unsubscribe(); return value }
  versionLabel(dataset: TailingsDataset, versionId: string): string {
    const version = dataset.thresholdVersions.find((item) => item.id === versionId)
    return version ? `${version.thresholdId} V${version.version}` : '—'
  }
  jobFor(dataset: TailingsDataset, anomalyId: string): RecalcJob | undefined {
    return dataset.recalcJobs.find((job) => job.anomalyId === anomalyId)
  }
  progress(job: RecalcJob): number {
    return job.scopeReadingIds.length ? Math.round((job.processedReadingIds.length / job.scopeReadingIds.length) * 100) : 0
  }
  approveDisabled(dataset: TailingsDataset, anomaly: Anomaly): boolean {
    const running = dataset.recalcJobs.some((job) => job.anomalyId === anomaly.id && job.status === '进行中')
    return (anomaly.severity === '重大' && !anomaly.plan.emergencyLinked) || anomaly.plan.approvalHold || running
  }
  updateKeyword(value: string): void { this.store.dispatch(TailingsActions.updateKeyword({ keyword: value })) }
  updateStatus(value: Anomaly['status'] | '全部'): void { this.store.dispatch(TailingsActions.updateStatus({ status: value })) }
  select(id: string): void { this.store.dispatch(TailingsActions.selectAnomaly({ anomalyId: id })) }
  submitReview(anomaly: Anomaly): void {
    const review: FieldReview = { id: `FR-${Date.now()}`, inspector: '宋立', arrivedAt: new Date().toISOString(), ...this.fieldForm, version: 0 }
    this.store.dispatch(TailingsActions.submitFieldReview({ anomalyId: anomaly.id, review }))
  }
  addOpinion(anomaly: Anomaly): void { this.store.dispatch(TailingsActions.addExpertOpinion({ anomalyId: anomaly.id, opinion: { id: `OP-${Date.now()}`, specialist: '当前用户', ...this.opinionForm, conclusion: '补充证据', createdAt: new Date().toISOString() } })) }
  savePlan(anomaly: Anomaly): void { this.store.dispatch(TailingsActions.saveDispositionPlan({ anomalyId: anomaly.id, plan: { ...anomaly.plan, ...this.planForm, emergencyLinked: anomaly.plan.emergencyLinked, approvedBy: '', approvedAt: '' } })) }
  approve(anomaly: Anomaly): void { this.store.dispatch(TailingsActions.approvePlan({ anomalyId: anomaly.id, approver: '负责人 何清', note: '同意执行，严格执行关闭条件。' })) }
  confirmBasis(anomaly: Anomaly): void { this.store.dispatch(TailingsActions.confirmPlanBasis({ anomalyId: anomaly.id, operator: '负责人 何清' })) }
  emergency(anomaly: Anomaly): void { this.store.dispatch(TailingsActions.createEmergencyLink({ anomalyId: anomaly.id, note: '重大异常联动应急值班，通知下游巡查。' })) }
  close(anomaly: Anomaly): void { this.store.dispatch(TailingsActions.closeAnomaly({ anomalyId: anomaly.id, note: '复测数据稳定，关闭条件已满足。' })) }
  requestRecalc(anomaly: Anomaly): void { this.store.dispatch(TailingsActions.requestRecalc({ anomalyId: anomaly.id, operator: '值班员 王峰' })) }
  interrupt(job: RecalcJob): void { this.store.dispatch(TailingsActions.interruptRecalc({ jobId: job.id, error: '重算引擎心跳丢失（模拟故障）' })) }
  resume(job: RecalcJob): void { this.store.dispatch(TailingsActions.resumeRecalc({ jobId: job.id, operator: '值班员 王峰' })) }
}
