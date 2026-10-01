import { createFeatureSelector, createSelector } from '@ngrx/store'
import type { ReviewPackage } from '../domain'
import type { TailingsState } from './tailings.reducer'

export const selectTailings = createFeatureSelector<TailingsState>('tailings')

/** 打开审阅包后，全部页面都按包内固定快照解释；关闭则回到实时数据 */
export const selectViewDataset = createSelector(selectTailings, (state): { dataset: TailingsState['dataset']; pkg: ReviewPackage | undefined } => {
  const pkg = state.viewingPackageId ? state.dataset.reviewPackages.find((item) => item.id === state.viewingPackageId) : undefined
  return { dataset: pkg?.dataset ?? state.dataset, pkg }
})
export const selectDataset = createSelector(selectViewDataset, (view) => view.dataset)
export const selectReviewPackage = createSelector(selectViewDataset, (view) => view.pkg)
export const selectPoints = createSelector(selectDataset, (dataset) => dataset.points)
export const selectThresholdVersions = createSelector(selectDataset, (dataset) => dataset.thresholdVersions)
export const selectAnomalies = createSelector(selectDataset, (dataset) => dataset.anomalies)
export const selectRecomputeJobs = createSelector(selectDataset, (dataset) => dataset.recomputeJobs)
export const selectConclusions = createSelector(selectDataset, (dataset) => dataset.conclusions)
export const selectReviewPackages = createSelector(selectDataset, (dataset) => dataset.reviewPackages)
export const selectSelectedAnomaly = createSelector(selectTailings, selectViewDataset, (state, view) => view.dataset.anomalies.find((item) => item.id === state.selectedAnomalyId) ?? view.dataset.anomalies[0])
export const selectFilteredAnomalies = createSelector(selectTailings, selectViewDataset, (state, view) => view.dataset.anomalies.filter((item) => {
  const point = view.dataset.points.find((value) => value.id === item.pointId)
  const text = `${item.id} ${item.title} ${item.owner} ${point?.name ?? ''}`.toLowerCase()
  return (!state.keyword || text.includes(state.keyword.toLowerCase())) && (state.status === '全部' || item.status === state.status)
}))
export const selectFailNextRecompute = createSelector(selectTailings, (state) => state.failNextRecompute)
export const selectViewingPackageId = createSelector(selectTailings, (state) => state.viewingPackageId)
