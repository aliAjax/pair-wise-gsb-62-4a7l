import type { TailingsDataset } from '../domain'

export const seedDataset: TailingsDataset = {
  points: [
    { id: 'P-D01', name: '主坝顶部位移点 D01', zone: '主坝', type: '位移', longitude: 112.832, latitude: 40.116, status: '异常', currentValue: 18.7, unit: 'mm', thresholdId: 'T-D', lastInspectionAt: '2026-09-29T08:20:00' },
    { id: 'P-D02', name: '主坝下游位移点 D02', zone: '主坝', type: '位移', longitude: 112.837, latitude: 40.111, status: '预警', currentValue: 12.4, unit: 'mm', thresholdId: 'T-D', lastInspectionAt: '2026-09-29T08:10:00' },
    { id: 'P-W01', name: '库内水位计 W01', zone: '库区', type: '水位', longitude: 112.846, latitude: 40.121, status: '预警', currentValue: 873.4, unit: 'm', thresholdId: 'T-W', lastInspectionAt: '2026-09-29T07:55:00' },
    { id: 'P-S01', name: '主坝渗流计 S01', zone: '主坝', type: '渗流', longitude: 112.827, latitude: 40.106, status: '正常', currentValue: 1.8, unit: 'L/s', thresholdId: 'T-S', lastInspectionAt: '2026-09-29T07:40:00' },
    { id: 'P-R01', name: '库区雨量站 R01', zone: '库区', type: '降雨', longitude: 112.861, latitude: 40.132, status: '正常', currentValue: 24.6, unit: 'mm/h', thresholdId: 'T-R', lastInspectionAt: '2026-09-29T08:00:00' }
  ],
  thresholds: [
    { id: 'T-D', type: '位移', warning: 10, alarm: 16, changeRate: 3, unit: 'mm/d', enabled: true, version: 4, activeVersionId: 'TV-D-004' },
    { id: 'T-W', type: '水位', warning: 871, alarm: 873, changeRate: 0.5, unit: 'm/h', enabled: true, version: 3, activeVersionId: 'TV-W-003' },
    { id: 'T-S', type: '渗流', warning: 2.2, alarm: 3, changeRate: 0.4, unit: 'L/s', enabled: true, version: 5, activeVersionId: 'TV-S-005' },
    { id: 'T-R', type: '降雨', warning: 30, alarm: 50, changeRate: 10, unit: 'mm/h', enabled: true, version: 2, activeVersionId: 'TV-R-002' }
  ],
  thresholdVersions: [
    { id: 'TV-D-003', thresholdId: 'T-D', version: 3, warning: 9, alarm: 14, changeRate: 2.5, unit: 'mm/d', status: '已废止', submittedBy: '值班员 王峰', frozenAt: '2026-08-12T09:00:00', effectiveAt: '2026-08-12T09:00:00', supersedesVersionId: '', note: '汛期前例行调整' },
    { id: 'TV-D-004', thresholdId: 'T-D', version: 4, warning: 10, alarm: 16, changeRate: 3, unit: 'mm/d', status: '已生效', submittedBy: '专工 李牧', frozenAt: '2026-09-01T10:00:00', effectiveAt: '2026-09-01T10:00:00', supersedesVersionId: 'TV-D-003', note: '结合近一年位移基线修订' },
    { id: 'TV-W-002', thresholdId: 'T-W', version: 2, warning: 870, alarm: 872, changeRate: 0.4, unit: 'm/h', status: '已废止', submittedBy: '值班员 王峰', frozenAt: '2026-07-20T09:30:00', effectiveAt: '2026-07-20T09:30:00', supersedesVersionId: '', note: '初设值' },
    { id: 'TV-W-003', thresholdId: 'T-W', version: 3, warning: 871, alarm: 873, changeRate: 0.5, unit: 'm/h', status: '已生效', submittedBy: '专工 许洁', frozenAt: '2026-08-28T14:00:00', effectiveAt: '2026-08-28T14:00:00', supersedesVersionId: 'TV-W-002', note: '按设计洪水位复核调整' },
    { id: 'TV-S-004', thresholdId: 'T-S', version: 4, warning: 2, alarm: 2.8, changeRate: 0.3, unit: 'L/s', status: '已废止', submittedBy: '专工 李牧', frozenAt: '2026-06-15T11:00:00', effectiveAt: '2026-06-15T11:00:00', supersedesVersionId: '', note: '渗流季前调整' },
    { id: 'TV-S-005', thresholdId: 'T-S', version: 5, warning: 2.2, alarm: 3, changeRate: 0.4, unit: 'L/s', status: '已生效', submittedBy: '专工 周岩', frozenAt: '2026-09-10T09:00:00', effectiveAt: '2026-09-10T09:00:00', supersedesVersionId: 'TV-S-004', note: '结合渗压联合分析修订' },
    { id: 'TV-R-001', thresholdId: 'T-R', version: 1, warning: 28, alarm: 45, changeRate: 8, unit: 'mm/h', status: '已废止', submittedBy: '值班员 王峰', frozenAt: '2026-05-30T08:00:00', effectiveAt: '2026-05-30T08:00:00', supersedesVersionId: '', note: '初设值' },
    { id: 'TV-R-002', thresholdId: 'T-R', version: 2, warning: 30, alarm: 50, changeRate: 10, unit: 'mm/h', status: '已生效', submittedBy: '专工 许洁', frozenAt: '2026-08-01T08:00:00', effectiveAt: '2026-08-01T08:00:00', supersedesVersionId: 'TV-R-001', note: '按重现期雨量修订' }
  ],
  readings: [
    { id: 'RD-1', pointId: 'P-D01', value: 18.7, unit: 'mm', capturedAt: '2026-09-29T08:20:00', deviceId: 'GNSS-D01', quality: '有效' },
    { id: 'RD-2', pointId: 'P-D01', value: 16.2, unit: 'mm', capturedAt: '2026-09-29T07:20:00', deviceId: 'GNSS-D01', quality: '有效' },
    { id: 'RD-3', pointId: 'P-D01', value: 13.8, unit: 'mm', capturedAt: '2026-09-29T06:20:00', deviceId: 'GNSS-D01', quality: '有效' },
    { id: 'RD-4', pointId: 'P-W01', value: 873.4, unit: 'm', capturedAt: '2026-09-29T07:55:00', deviceId: 'WL-W01', quality: '有效' },
    { id: 'RD-5', pointId: 'P-D01', value: 12.9, unit: 'mm', capturedAt: '2026-09-29T05:20:00', deviceId: 'GNSS-D01', quality: '有效' },
    { id: 'RD-6', pointId: 'P-D01', value: 11.4, unit: 'mm', capturedAt: '2026-09-29T04:20:00', deviceId: 'GNSS-D01', quality: '有效' },
    { id: 'RD-7', pointId: 'P-D02', value: 12.4, unit: 'mm', capturedAt: '2026-09-29T08:10:00', deviceId: 'GNSS-D02', quality: '有效' }
  ],
  verdicts: [
    { id: 'VJ-1', readingId: 'RD-1', pointId: 'P-D01', thresholdVersionId: 'TV-D-004', verdict: '异常', judgedAt: '2026-09-29T08:20:00', jobId: 'INITIAL', pendingRecalc: false, superseded: false },
    { id: 'VJ-2', readingId: 'RD-2', pointId: 'P-D01', thresholdVersionId: 'TV-D-004', verdict: '异常', judgedAt: '2026-09-29T07:20:00', jobId: 'INITIAL', pendingRecalc: false, superseded: false },
    { id: 'VJ-3', readingId: 'RD-3', pointId: 'P-D01', thresholdVersionId: 'TV-D-004', verdict: '预警', judgedAt: '2026-09-29T06:20:00', jobId: 'INITIAL', pendingRecalc: false, superseded: false },
    { id: 'VJ-4', readingId: 'RD-4', pointId: 'P-W01', thresholdVersionId: 'TV-W-003', verdict: '预警', judgedAt: '2026-09-29T07:55:00', jobId: 'INITIAL', pendingRecalc: false, superseded: false },
    { id: 'VJ-5', readingId: 'RD-5', pointId: 'P-D01', thresholdVersionId: 'TV-D-004', verdict: '预警', judgedAt: '2026-09-29T05:20:00', jobId: 'INITIAL', pendingRecalc: false, superseded: false },
    { id: 'VJ-6', readingId: 'RD-6', pointId: 'P-D01', thresholdVersionId: 'TV-D-004', verdict: '预警', judgedAt: '2026-09-29T04:20:00', jobId: 'INITIAL', pendingRecalc: false, superseded: false },
    { id: 'VJ-7', readingId: 'RD-7', pointId: 'P-D02', thresholdVersionId: 'TV-D-004', verdict: '预警', judgedAt: '2026-09-29T08:10:00', jobId: 'INITIAL', pendingRecalc: false, superseded: false }
  ],
  anomalies: [
    {
      id: 'AN-260929-01', pointId: 'P-D01', title: '主坝D01累计位移超过报警阈值', severity: '重大', status: '待负责人审批', openedAt: '2026-09-29T08:25:00', owner: '坝体安全组', triggerReadingId: 'RD-1', observedValue: '18.7 mm，昨日变化4.2 mm/d', version: 7, closedAt: '',
      basisVersionId: 'TV-D-004', recalcState: '无需重算',
      fieldReviews: [{ id: 'FR-1', inspector: '宋立', arrivedAt: '2026-09-29T09:10:00', observed: '坝顶排水沟未见明显开裂，D01附近无新增裂缝，基准点稳定。', evidence: 'D01近景照片、基准点复核记录、GNSS原始观测文件', reassessment: '读数有效，位移趋势仍上升，建议立即降低库水位并加密监测。', version: 2 }],
      opinions: [
        { id: 'OP-1', specialist: '周岩', discipline: '岩土', content: '近三日位移速率持续高于阈值，需结合孔隙水压力分析潜在滑面。', conclusion: '支持结论', createdAt: '2026-09-29T10:20:00' },
        { id: 'OP-2', specialist: '许洁', discipline: '水文', content: '库水位仍接近警戒线，建议优先降低库水位并核对上游来水。', conclusion: '补充证据', createdAt: '2026-09-29T10:45:00' }
      ],
      plan: { id: 'PL-1', action: '降低库水位', owner: '库区调度班', deadline: '2026-09-29T18:00:00', conditions: '每2小时复测D01、D02和W01；位移速率恢复至3mm/d以下并稳定12小时后，负责人可关闭异常。', emergencyLinked: true, approvedBy: '', approvedAt: '', basisVersionId: 'TV-D-004', approvalHold: false, holdReason: '', confirmedBy: '', confirmedAt: '' }
    },
    {
      id: 'AN-260929-02', pointId: 'P-W01', title: '库水位短时上升速率超预警值', severity: '较高', status: '原因调查中', openedAt: '2026-09-29T08:00:00', owner: '库区调度班', triggerReadingId: 'RD-4', observedValue: '873.4 m，1小时上升0.6 m', version: 4, closedAt: '',
      basisVersionId: 'TV-W-003', recalcState: '无需重算',
      fieldReviews: [], opinions: [{ id: 'OP-3', specialist: '许洁', discipline: '水文', content: '上游降雨汇流导致入湖量增加，需核实泄洪闸状态。', conclusion: '支持结论', createdAt: '2026-09-29T09:00:00' }],
      plan: { id: 'PL-2', action: '加密监测', owner: '库区调度班', deadline: '2026-09-29T14:00:00', conditions: '每小时记录水位与入库流量，达到874.0m时启动应急联动。', emergencyLinked: false, approvedBy: '', approvedAt: '', basisVersionId: 'TV-W-003', approvalHold: false, holdReason: '', confirmedBy: '', confirmedAt: '' }
    }
  ],
  recalcJobs: [],
  reviewPackages: [],
  audit: [
    { id: 'A-1', entityId: 'P-D01', action: '生成异常', operator: '阈值引擎', detail: '累计位移18.7mm超过报警阈值16mm（T-D V4）', createdAt: '2026-09-29T08:25:00' },
    { id: 'A-2', entityId: 'AN-260929-01', action: '提交现场复核', operator: '宋立', detail: '原始读数有效，位移趋势仍上升', createdAt: '2026-09-29T09:25:00' },
    { id: 'A-3', entityId: 'AN-260929-01', action: '补充专业意见', operator: '周岩', detail: '建议结合孔隙水压力分析潜在滑面', createdAt: '2026-09-29T10:20:00' }
  ]
}
