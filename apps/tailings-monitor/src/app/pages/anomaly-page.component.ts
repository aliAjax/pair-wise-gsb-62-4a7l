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
import type { Anomaly, DispositionPlan, ExpertOpinion, FieldReview, RecomputeConclusion, RecomputeJob } from '../domain'
import { PackageBannerComponent } from '../components/package-banner.component'
import { TailingsActions } from '../store/tailings.actions'
import { selectAnomalies, selectConclusions, selectDataset, selectFailNextRecompute, selectFilteredAnomalies, selectRecomputeJobs, selectReviewPackage, selectSelectedAnomaly, selectTailings } from '../store/tailings.selectors'

@Component({
  selector: 'app-anomaly-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatTableModule, PackageBannerComponent],
  template: `
    <section class="page">
      <app-package-banner />
      <div class="metrics">
        <article><span>待现场复核</span><strong>{{ count('待现场复核') }}</strong><small>不得直接关闭</small></article>
        <article><span>调查与审批</span><strong>{{ count('原因调查中') + count('待负责人审批') }}</strong><small>多专业意见并存</small></article>
        <article><span>审批暂停</span><strong>{{ heldCount$ | async }}</strong><small>阈值更新待重算确认</small></article>
        <article><span>已关闭</span><strong>{{ count('已关闭') }}</strong><small>依据版本已固定</small></article>
      </div>
      <div class="toolbar">
        <mat-form-field appearance="outline"><mat-label>搜索异常</mat-label><input matInput [(ngModel)]="localKeyword" (ngModelChange)="updateKeyword($event)" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>状态</mat-label><mat-select [(ngModel)]="localStatus" (ngModelChange)="updateStatus($event)"><mat-option value="全部">全部</mat-option><mat-option *ngFor="let item of statuses" [value]="item">{{ item }}</mat-option></mat-select></mat-form-field>
        <label class="fail-switch"><input type="checkbox" [checked]="failNext$ | async" (change)="toggleFail()" /> 模拟下一条重算断点失败</label>
      </div>
      <div class="split">
        <table mat-table [dataSource]="filtered$ | async" class="panel">
          <ng-container matColumnDef="title"><th mat-header-cell *matHeaderCellDef>异常</th><td mat-cell *matCellDef="let row"><b>{{ row.title }}</b><small class="sub">{{ row.id }} · {{ row.pointId }} · 依据 {{ row.basisVersionId }}</small><span class="hold-mini" *ngIf="row.approvalHold">审批暂停</span></td></ng-container>
          <ng-container matColumnDef="severity"><th mat-header-cell *matHeaderCellDef>级别</th><td mat-cell *matCellDef="let row"><span class="severity" [class.major]="row.severity === '重大'">{{ row.severity }}</span></td></ng-container>
          <ng-container matColumnDef="status"><th mat-header-cell *matHeaderCellDef>状态</th><td mat-cell *matCellDef="let row">{{ row.status }}</td></ng-container>
          <ng-container matColumnDef="version"><th mat-header-cell *matHeaderCellDef>版本</th><td mat-cell *matCellDef="let row">V{{ row.version }}</td></ng-container>
          <ng-container matColumnDef="open"><th mat-header-cell *matHeaderCellDef></th><td mat-cell *matCellDef="let row"><button mat-button (click)="select(row.id)">审阅</button></td></ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr><tr mat-row *matRowDef="let row; columns: columns" [class.selected]="row.id === (selected$ | async)?.id"></tr>
        </table>
        <div class="panel detail" *ngIf="selected$ | async as selected">
          <div class="detail-head">
            <div><span>{{ selected.id }} · V{{ selected.version }} · 当前依据 <b>{{ selected.basisVersionId }}</b></span><h2>{{ selected.title }}</h2><p>{{ selected.observedValue }}</p></div>
            <span class="severity" [class.major]="selected.severity === '重大'">{{ selected.severity }}</span>
          </div>

          <div class="hold-band" *ngIf="selected.approvalHold">
            <b>审批暂停</b>
            <p>{{ selected.holdReason }}</p>
          </div>

          <h3>阈值依据变更链</h3>
          <div class="basis-list"><article *ngFor="let item of selected.basisHistory"><span>{{ item.changedAt.replace('T', ' ').slice(0, 16) }} · {{ item.changedBy }}</span><b>{{ item.basisVersionId }} · {{ item.severity }}</b><p>{{ item.summary }}</p></article></div>

          <h3>重算任务（同一异常并发只受理一次）</h3>
          <div class="jobs" *ngIf="(jobsFor(selected) | async) as jobs; else noJobs">
            <article *ngFor="let job of jobs">
              <div class="job-head"><b>{{ job.id }}</b><span class="pill" [class]="job.status">{{ job.status }}</span></div>
              <small>目标版本 {{ job.targetVersionId }} · 断点 {{ job.checkpoints.length }}/{{ job.total }} · 受理次数 {{ job.attempts }}</small>
              <div class="progress"><i [style.width.%]="job.total ? (job.checkpoints.length / job.total * 100) : 100"></i></div>
              <p class="error" *ngIf="job.lastError">最近失败：{{ job.lastError }}</p>
              <p class="reject" *ngIf="job.rejectReason">{{ job.rejectReason }}</p>
              <fieldset class="inline-actions" [disabled]="(pkg$ | async)">
                <button mat-stroked-button color="primary" [disabled]="job.status === '重算中' || job.status === '已完成' || job.status === '已被新版本取代'" (click)="acceptJob(job.id)">{{ job.status === '失败可恢复' ? '从断点恢复受理' : '受理重算' }}</button>
                <button mat-flat-button color="primary" [disabled]="job.checkpoints.length < job.total || job.status === '已完成' || job.status === '已被新版本取代'" (click)="finalizeJob(job.id)">固化重算结果</button>
              </fieldset>
            </article>
            <p class="empty" *ngIf="!jobs.length">该异常暂无重算任务。</p>
          </div>
          <ng-template #noJobs><p class="empty">该异常暂无重算任务。</p></ng-template>

          <h3>重算结论（负责人确认后换据）</h3>
          <div class="conclusions" *ngIf="(conclusionsFor(selected) | async) as conclusions">
            <article *ngFor="let conclusion of conclusions">
              <div class="job-head"><b>{{ conclusion.basisVersionId }}：{{ conclusion.priorSeverity }} → {{ conclusion.recomputedSeverity }}</b><span class="pill" [class.done]="conclusion.confirmedBy">{{ conclusion.confirmedBy ? '已确认' : '待确认' }}</span></div>
              <p>{{ conclusion.basisSummary }}</p>
              <fieldset class="inline-actions" [disabled]="(pkg$ | async)">
                <button mat-flat-button color="primary" *ngIf="!conclusion.confirmedBy" (click)="confirmConclusion(conclusion.id)">负责人确认并按新版本继续</button>
              </fieldset>
              <small *ngIf="conclusion.confirmedBy">{{ conclusion.confirmedBy }} · {{ conclusion.confirmedAt.replace('T', ' ').slice(0, 16) }}</small>
            </article>
            <p class="empty" *ngIf="!conclusions.length">尚无重算结论；重算固化后在此等待负责人确认。</p>
          </div>

          <h3>现场复核</h3>
          <fieldset [disabled]="(pkg$ | async)">
          <div class="review-form"><mat-form-field appearance="outline" class="wide"><mat-label>现场观察</mat-label><textarea matInput rows="2" [(ngModel)]="fieldForm.observed"></textarea></mat-form-field><mat-form-field appearance="outline"><mat-label>证据清单</mat-label><input matInput [(ngModel)]="fieldForm.evidence" /></mat-form-field><mat-form-field appearance="outline"><mat-label>重新评估</mat-label><input matInput [(ngModel)]="fieldForm.reassessment" /></mat-form-field><button mat-flat-button color="primary" (click)="submitReview(selected)">提交复核版本</button></div>
          </fieldset>
          <div class="records" *ngFor="let review of selected.fieldReviews"><b>{{ review.inspector }} · V{{ review.version }}</b><p>{{ review.observed }}</p><span>{{ review.reassessment }} · {{ review.evidence }}</span></div>
          <h3>专业意见</h3>
          <fieldset [disabled]="(pkg$ | async)">
          <div class="opinion-form"><mat-form-field appearance="outline"><mat-label>专业</mat-label><mat-select [(ngModel)]="opinionForm.discipline"><mat-option *ngFor="let item of disciplines" [value]="item">{{ item }}</mat-option></mat-select></mat-form-field><mat-form-field appearance="outline" class="wide"><mat-label>意见</mat-label><input matInput [(ngModel)]="opinionForm.content" /></mat-form-field><button mat-button (click)="addOpinion(selected)">补充意见</button></div>
          </fieldset>
          <div class="opinions"><article *ngFor="let opinion of selected.opinions"><b>{{ opinion.discipline }}专家 {{ opinion.specialist }}</b><span>{{ opinion.conclusion }}</span><p>{{ opinion.content }}</p></article></div>
          <h3>处置方案与会签 <small class="plan-basis">方案依据 {{ selected.plan.basisVersionId }}</small></h3>
          <fieldset [disabled]="(pkg$ | async)">
          <div class="plan-form"><mat-form-field appearance="outline"><mat-label>措施</mat-label><mat-select [(ngModel)]="planForm.action"><mat-option *ngFor="let item of actions" [value]="item">{{ item }}</mat-option></mat-select></mat-form-field><mat-form-field appearance="outline"><mat-label>责任方</mat-label><input matInput [(ngModel)]="planForm.owner" /></mat-form-field><mat-form-field appearance="outline" class="wide"><mat-label>关闭条件</mat-label><textarea matInput rows="2" [(ngModel)]="planForm.conditions"></textarea></mat-form-field><mat-form-field appearance="outline"><mat-label>截止</mat-label><input matInput type="datetime-local" [(ngModel)]="planForm.deadline" /></mat-form-field><button mat-button (click)="savePlan(selected)">提交审批</button></div>
          <div class="approval-band" [class.held]="selected.approvalHold">
            <div><b>{{ selected.plan.approvedBy || '尚未审批' }}</b><span>{{ selected.plan.conditions }}</span><small class="basis-line">会签依据必须与异常当前依据 {{ selected.basisVersionId }} 一致</small></div>
            <button mat-flat-button color="primary" [disabled]="selected.approvalHold || (selected.severity === '重大' && !selected.plan.emergencyLinked)" (click)="approve(selected)">负责人审批</button>
            <button mat-button color="warn" (click)="emergency(selected)">应急联动</button>
            <button mat-button [disabled]="selected.status !== '待负责人审批' || selected.approvalHold" (click)="close(selected)">关闭异常</button>
          </div>
          </fieldset>
          <p class="approve-tip" *ngIf="selected.approvalHold">审批暂停中：先完成重算并由负责人确认结论，再按新依据继续批准。</p>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .page { padding: 22px 28px 45px; }.metrics { display: grid; grid-template-columns: repeat(4, 1fr); background: white; border: 1px solid #d9e1df; margin-bottom: 14px; }.metrics article { padding: 16px 18px; border-right: 1px solid #e2e7e6; }.metrics article:last-child { border: 0; }.metrics span, .metrics strong, .metrics small { display: block; }.metrics span { color: #72807d; font-size: 12px; }.metrics strong { font-size: 26px; color: #245060; margin: 6px 0; }.metrics small { color: #98a4a0; font-size: 10px; }
    .toolbar { display: flex; gap: 10px; margin-bottom: 10px; align-items: center; }.fail-switch { font-size: 12px; color: #7a5b22; background: #fdf4de; border: 1px solid #e7d09a; padding: 8px 12px; border-radius: 4px; white-space: nowrap; }
    .split { display: grid; grid-template-columns: minmax(560px,1fr) 560px; gap: 14px; align-items: start; }.panel { background: white; border: 1px solid #d9e1df; } table { width: 100%; }.selected { background: #eef5f4; }.sub { display: block; color: #7c8986; font-size: 10px; margin-top: 3px; }.hold-mini { display: inline-block; margin-top: 4px; background: #fae8e6; color: #a43c35; font-size: 10px; padding: 1px 6px; border-radius: 8px; }.severity { padding: 3px 7px; border-radius: 3px; background: #f7edd6; color: #8e681d; font-size: 11px; }.severity.major { background: #fae7e5; color: #a23b34; }
    .detail { padding: 16px; max-height: none; }.detail-head { display: flex; justify-content: space-between; align-items: start; border-bottom: 1px solid #e1e6e5; padding-bottom: 12px; }.detail-head span { color: #74827f; font-size: 10px; }.detail-head h2 { margin: 4px 0; font-size: 18px; }.detail-head p { margin: 0; color: #65736f; font-size: 12px; }.detail h3 { font-size: 13px; margin: 16px 0 8px; }
    .hold-band { background: #fbe9e7; border-left: 3px solid #b8412f; padding: 9px 12px; margin-top: 10px; }.hold-band b { color: #a43c35; font-size: 12px; }.hold-band p { margin: 4px 0 0; color: #8d493e; font-size: 11px; }
    .basis-list article { border-left: 3px solid #315d6e; background: #f5f8f7; padding: 8px 10px; margin-top: 6px; }.basis-list span { display: block; color: #8a9693; font-size: 10px; }.basis-list b { font-size: 11px; color: #2a5363; }.basis-list p { margin: 3px 0 0; font-size: 11px; color: #5f6d69; }
    .jobs article, .conclusions article { border: 1px solid #e0e6e4; padding: 10px; margin-bottom: 8px; }.job-head { display: flex; justify-content: space-between; align-items: center; }.job-head b { font-size: 12px; }
    fieldset { border: 0; padding: 0; margin: 0; min-width: 0; } fieldset:disabled { opacity: 0.6; } .inline-actions { display: flex; gap: 8px; margin-top: 6px; }
    .pill { padding: 2px 8px; border-radius: 10px; font-size: 10px; background: #ecefe9; color: #6f7a75; }.pill.待受理 { background: #fdf3dc; color: #92691c; }.pill.重算中 { background: #e2edf7; color: #2d5f8c; }.pill.失败可恢复 { background: #fbe3df; color: #a43c35; }.pill.已完成, .pill.done { background: #e4f1ea; color: #2e765a; }.pill.已被新版本取代 { background: #ececec; color: #8a8f8d; }
    .progress { height: 5px; background: #e8edec; border-radius: 3px; margin: 6px 0; overflow: hidden; }.progress i { display: block; height: 100%; background: #3f7d93; }
    .jobs small, .conclusions small { color: #8a9693; font-size: 10px; }.error { color: #a43c35; font-size: 11px; margin: 5px 0; }.reject { color: #936d20; font-size: 11px; margin: 5px 0; }.job-actions { display: flex; gap: 8px; margin-top: 6px; }.empty { color: #98a4a0; font-size: 11px; }
    .conclusions p { font-size: 11px; color: #5f6d69; margin: 5px 0; }.conclusions button { margin: 4px 0; }
    .review-form, .opinion-form, .plan-form { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }.review-form .wide, .opinion-form .wide, .plan-form .wide { grid-column: 1 / -1; }.review-form button, .plan-form button { align-self: center; }.records { border-left: 3px solid #315d6e; background: #f5f8f7; padding: 9px; margin-top: 7px; display: grid; gap: 4px; }.records p { margin: 0; font-size: 12px; }.records span { color: #72807d; font-size: 10px; }
    .opinions article { border-bottom: 1px solid #e2e7e6; padding: 9px 0; display: grid; grid-template-columns: 1fr auto; gap: 4px; }.opinions p { grid-column: 1 / -1; margin: 0; font-size: 12px; }.opinions span { color: #8a6720; font-size: 10px; }
    .plan-basis { color: #7a8784; font-weight: normal; }
    .approval-band { display: grid; grid-template-columns: 1fr auto auto auto; align-items: center; gap: 7px; background: #f6f0df; border-left: 3px solid #c99f3d; padding: 10px; margin-top: 12px; }.approval-band.held { background: #f4e5e2; border-left-color: #b8412f; }.approval-band b, .approval-band span, .approval-band small { display: block; }.approval-band span { color: #746c55; font-size: 10px; margin-top: 4px; }.basis-line { color: #96875f; font-size: 9px; margin-top: 3px; }.approve-tip { color: #a43c35; font-size: 10px; margin: 6px 0 0; }
  `]
})
export class AnomalyPageComponent {
  private readonly store = inject(Store)
  readonly filtered$ = this.store.select(selectFilteredAnomalies)
  readonly selected$ = this.store.select(selectSelectedAnomaly)
  readonly all$ = this.store.select(selectAnomalies)
  readonly jobs$ = this.store.select(selectRecomputeJobs)
  readonly conclusions$ = this.store.select(selectConclusions)
  readonly failNext$ = this.store.select(selectFailNextRecompute)
  readonly pkg$ = this.store.select(selectReviewPackage)
  readonly heldCount$ = this.all$.pipe(map((items) => items.filter((item) => item.approvalHold).length))
  readonly columns = ['title', 'severity', 'status', 'version', 'open']
  readonly statuses: Anomaly['status'][] = ['待现场复核', '原因调查中', '待负责人审批', '应急联动', '已关闭']
  readonly disciplines: ExpertOpinion['discipline'][] = ['坝体', '水文', '岩土', '应急']
  readonly actions: DispositionPlan['action'][] = ['加密监测', '降低库水位', '疏通排水', '应急撤离准备', '工程加固']
  localKeyword = ''
  localStatus: Anomaly['status'] | '全部' = '全部'
  fieldForm = { observed: '', evidence: '', reassessment: '' }
  opinionForm = { discipline: '坝体' as ExpertOpinion['discipline'], content: '' }
  planForm = { action: '加密监测' as DispositionPlan['action'], owner: '坝体安全组', conditions: '', deadline: '2026-09-29T18:00' }

  jobsFor(selected: Anomaly) {
    return this.jobs$.pipe(map((jobs) => jobs.filter((job) => job.affectedPointIds.includes(selected.pointId))))
  }

  conclusionsFor(selected: Anomaly) {
    return this.conclusions$.pipe(map((items: RecomputeConclusion[]) => items.filter((item) => item.anomalyId === selected.id)))
  }

  count(status: Anomaly['status']): number {
    let value = 0
    this.all$.subscribe((items) => { value = items.filter((item) => item.status === status).length }).unsubscribe()
    return value
  }
  updateKeyword(value: string): void { this.store.dispatch(TailingsActions.updateKeyword({ keyword: value })) }
  updateStatus(value: Anomaly['status'] | '全部'): void { this.store.dispatch(TailingsActions.updateStatus({ status: value })) }
  select(id: string): void { this.store.dispatch(TailingsActions.selectAnomaly({ anomalyId: id })) }
  toggleFail(): void { this.store.dispatch(TailingsActions.toggleFailNextRecompute()) }
  acceptJob(jobId: string): void { this.store.dispatch(TailingsActions.acceptRecompute({ jobId })) }
  finalizeJob(jobId: string): void { this.store.dispatch(TailingsActions.finalizeRecompute({ jobId })) }
  confirmConclusion(conclusionId: string): void { this.store.dispatch(TailingsActions.confirmRecomputeConclusion({ conclusionId })) }
  submitReview(anomaly: Anomaly): void {
    const review: FieldReview = { id: `FR-${Date.now()}`, inspector: '宋立', arrivedAt: new Date().toISOString(), ...this.fieldForm, version: 0 }
    this.store.dispatch(TailingsActions.submitFieldReview({ anomalyId: anomaly.id, review }))
  }
  addOpinion(anomaly: Anomaly): void { this.store.dispatch(TailingsActions.addExpertOpinion({ anomalyId: anomaly.id, opinion: { id: `OP-${Date.now()}`, specialist: '当前用户', ...this.opinionForm, conclusion: '补充证据', createdAt: new Date().toISOString() } })) }
  savePlan(anomaly: Anomaly): void { this.store.dispatch(TailingsActions.saveDispositionPlan({ anomalyId: anomaly.id, plan: { id: anomaly.plan.id, ...this.planForm, emergencyLinked: anomaly.plan.emergencyLinked, basisVersionId: anomaly.basisVersionId, approvedBy: '', approvedAt: '' } })) }
  approve(anomaly: Anomaly): void { this.store.dispatch(TailingsActions.approvePlan({ anomalyId: anomaly.id, approver: '负责人 何清', note: '同意执行，严格执行关闭条件。' })) }
  emergency(anomaly: Anomaly): void { this.store.dispatch(TailingsActions.createEmergencyLink({ anomalyId: anomaly.id, note: '重大异常联动应急值班，通知下游巡查。' })) }
  close(anomaly: Anomaly): void { this.store.dispatch(TailingsActions.closeAnomaly({ anomalyId: anomaly.id, note: '复测数据稳定，关闭条件已满足。' })) }
}
