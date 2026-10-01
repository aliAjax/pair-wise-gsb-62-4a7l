/**
 * 可追溯流程不变量验证：阈值冻结 → 待重算 → 去重 → 断点恢复 → 完成固化 → 审批闸门 → 审阅包固定版本。
 * 运行：npx tsc tools/verify-workflow.ts --outDir .verify --module commonjs --target ES2020 --moduleResolution node --skipLibCheck --rootDir . && node .verify/tools/verify-workflow.js
 */
import { seedDataset } from '../apps/tailings-monitor/src/app/data/seed'
import {
  approvePlan,
  buildReviewPackage,
  confirmPlanBasis,
  currentVerdictOf,
  effectiveVersionOf,
  interruptRecalc,
  recalcTick,
  requestRecalc,
  resumeRecalc,
  saveDispositionPlan,
  submitThresholdDraft,
  type ReviewPackage,
  type TailingsDataset,
  type WorkflowContext
} from '../apps/tailings-monitor/src/app/domain'

let failures = 0
const check = (name: string, condition: boolean, extra = ''): void => {
  if (condition) {
    console.log(`  ✓ ${name}`)
  } else {
    failures += 1
    console.error(`  ✗ ${name} ${extra}`)
  }
}

let seq = 0
const ctx = (operator: string): WorkflowContext => ({
  now: new Date(Date.UTC(2026, 8, 30, 1, 0, seq)).toISOString(),
  operator,
  nextId: (prefix) => `${prefix}-T${String(seq++).padStart(3, '0')}`
})

const dataset: TailingsDataset = structuredClone(seedDataset)
const AN1 = 'AN-260929-01'
const AN2 = 'AN-260929-02'

console.log('1. 阈值草稿提交即冻结适用版本')
const before = effectiveVersionOf(dataset, 'T-D')
check('初始生效版本为 T-D V4', before?.id === 'TV-D-004')
const rejectedDraft = submitThresholdDraft(dataset, 'T-D', { warning: 20, alarm: 18, changeRate: 2.5, note: '非法草稿' }, ctx('值班员 王峰'))
check('报警值不大于预警值的草稿被拒绝', rejectedDraft !== '')
const rejected = submitThresholdDraft(dataset, 'T-D', { warning: 12, alarm: 18, changeRate: 2.5, note: '位移基线修订' }, ctx('值班员 王峰'))
check('草稿提交受理', rejected === '')
const frozen = effectiveVersionOf(dataset, 'T-D')
check('新版本 V5 已生效并冻结', frozen?.version === 5 && frozen.frozenAt !== '' && frozen.submittedBy === '值班员 王峰')
check('旧版本 TV-D-004 已废止', dataset.thresholdVersions.find((v) => v.id === 'TV-D-004')?.status === '已废止')
check('阈值现行值指向 V5', dataset.thresholds.find((t) => t.id === 'T-D')?.activeVersionId === frozen?.id)

console.log('2. 旧读数保留原判但进入待重算')
const original = dataset.verdicts.find((v) => v.id === 'VJ-1')
check('RD-1 原判保留（未改写、未取代）', original?.verdict === '异常' && original.thresholdVersionId === 'TV-D-004' && !original.superseded)
check('RD-1 进入待重算', original?.pendingRecalc === true)
const anomaly1 = () => dataset.anomalies.find((a) => a.id === AN1)!
const job1 = () => dataset.recalcJobs.find((j) => j.anomalyId === AN1)!
check('受影响异常自动受理重算', anomaly1().recalcState === '重算中' && !!job1())
check('重算范围冻结为 D01 的 5 条读数', job1().scopeReadingIds.length === 5, `实际 ${job1().scopeReadingIds.length}`)
check('无异常测点生成点级重算任务', dataset.recalcJobs.some((j) => j.anomalyId === '' && j.pointId === 'P-D02'))
check('审批中的旧依据方案暂停批准', anomaly1().plan.approvalHold === true && anomaly1().plan.holdReason.includes('V5'))

console.log('3. 并发重算同一异常只能受理一次')
const jobCount = dataset.recalcJobs.length
const dup = requestRecalc(dataset, AN1, ctx('值班员 王峰'))
check('重复发起被拒绝', dup !== '' && dataset.recalcJobs.length === jobCount)
check('拒绝原因留痕审计', dataset.audit.some((a) => a.action === '重算请求被拒绝' && a.entityId === AN1))

console.log('4. 重算失败后从断点恢复')
recalcTick(dataset, ctx('重算引擎'))
recalcTick(dataset, ctx('重算引擎'))
check('两个节拍后断点推进到 2/5', job1().processedReadingIds.length === 2, `实际 ${job1().processedReadingIds.length}`)
check('中断保护：仅进行中可中断', interruptRecalc(dataset, job1().id, '心跳丢失', ctx('重算引擎')) === '')
check('任务置失败且断点保留', job1().status === '失败' && job1().processedReadingIds.length === 2)
check('失败任务不可重复发起', requestRecalc(dataset, AN1, ctx('值班员 王峰')) !== '' && dataset.recalcJobs.length === jobCount)
check('断点恢复受理', resumeRecalc(dataset, job1().id, ctx('值班员 王峰')) === '')
check('恢复后从断点继续（不回退、次数+1）', job1().status === '进行中' && job1().processedReadingIds.length === 2 && job1().attempts === 2)
for (let i = 0; i < 12; i += 1) recalcTick(dataset, ctx('重算引擎'))
check('重算完成', job1().status === '已完成' && job1().completedAt !== '')
check('异常判据版本更新为 V5', anomaly1().basisVersionId === frozen?.id && anomaly1().recalcState === '已按新版重算')
const rd1 = currentVerdictOf(dataset, 'RD-1')
check('RD-1 新判定按 V5 盖章', rd1?.thresholdVersionId === frozen?.id && rd1.verdict === '异常')
check('RD-6 按 V5 重算为正常（11.4 < 12）', currentVerdictOf(dataset, 'RD-6')?.verdict === '正常')
check('原判 VJ-1 作为历史版本保留', dataset.verdicts.find((v) => v.id === 'VJ-1')?.superseded === true)

console.log('5. 已完成结果不得再按旧版本返回')
check('完成后重复发起被拒绝', requestRecalc(dataset, AN1, ctx('值班员 王峰')) !== '')
check('完成后恢复请求被拒绝', resumeRecalc(dataset, job1().id, ctx('值班员 王峰')) !== '')
check('拒绝重放留痕审计', dataset.audit.some((a) => a.action === '恢复请求被拒绝' && a.detail.includes('不得按旧版本重放')))

console.log('6. 审批闸门：暂停批准 → 负责人确认 → 继续')
const approveWhileHold = approvePlan(dataset, AN1, '负责人 何清', '同意执行', ctx('负责人 何清'))
check('暂停期间批准被拒绝', approveWhileHold !== '' && anomaly1().plan.approvedBy === '')
check('负责人确认解除暂停', confirmPlanBasis(dataset, AN1, ctx('负责人 何清')) === '' && anomaly1().plan.approvalHold === false)
check('确认后批准通过', approvePlan(dataset, AN1, '负责人 何清', '同意执行', ctx('负责人 何清')) === '' && anomaly1().plan.approvedBy === '负责人 何清')

console.log('7. 审阅包：固定版本 + 异常关联 + 未完成重算，重新打开不漂移')
submitThresholdDraft(dataset, 'T-W', { warning: 872, alarm: 874, changeRate: 0.6, note: '汛后水位复核' }, ctx('值班员 王峰'))
const pkg = buildReviewPackage(dataset, [AN1, AN2], ctx('负责人 何清')) as ReviewPackage
check('审阅包生成', typeof pkg !== 'string')
if (typeof pkg !== 'string') {
  check('携带固定阈值版本', pkg.pinnedVersions.some((v) => v.versionId === frozen?.id) && pkg.pinnedVersions.some((v) => v.versionId === 'TV-W-003'))
  const entry2 = pkg.entries.find((e) => e.anomalyId === AN2)
  check('异常关联按判据版本解释（AN2 仍按 T-W V3）', entry2?.basisVersion === 3 && entry2.verdict === '预警')
  check('携带未完成重算', pkg.openRecalcJobs.some((j) => j.anomalyId === AN2 && j.status === '进行中'))
  for (let i = 0; i < 12; i += 1) recalcTick(dataset, ctx('重算引擎'))
  const anomaly2 = dataset.anomalies.find((a) => a.id === AN2)!
  check('后续重算把 AN2 判据推进到 T-W V4', anomaly2.basisVersionId === effectiveVersionOf(dataset, 'T-W')?.id)
  check('重新打开审阅包仍按打包版本 V3 解释', pkg.entries.find((e) => e.anomalyId === AN2)?.basisVersion === 3)
}

console.log('8. 新方案按现行版本记录依据')
const anomaly2 = dataset.anomalies.find((a) => a.id === AN2)!
const planSave = saveDispositionPlan(dataset, AN2, { ...anomaly2.plan, owner: '库区调度班', deadline: '2026-10-01T18:00:00', conditions: '每小时复测水位' }, ctx('当前用户'))
check('方案保存并锚定现行阈值版本', planSave === '' && anomaly2.plan.basisVersionId === effectiveVersionOf(dataset, 'T-W')?.id && !anomaly2.plan.approvalHold)

console.log('9. 审计链完整')
for (const action of ['冻结阈值版本', '受理重算', '重算请求被拒绝', '重算中断', '断点恢复', '重算完成', '暂停批准', '负责人确认', '审批处置方案', '生成审阅包']) {
  check(`审计含「${action}」`, dataset.audit.some((a) => a.action === action))
}

console.log(failures ? `\n${failures} 项断言失败` : '\n全部断言通过')
process.exit(failures ? 1 : 0)
