import { Injectable, inject } from '@angular/core'
import { Actions, createEffect, ofType } from '@ngrx/effects'
import { Store } from '@ngrx/store'
import { catchError, delay, filter, map, of, switchMap, withLatestFrom } from 'rxjs'
import { TailingsApiService } from '../services/tailings-api.service'
import { TailingsActions } from './tailings.actions'
import { selectRecalcJobs } from './tailings.selectors'

@Injectable()
export class TailingsEffects {
  private readonly actions$ = inject(Actions)
  private readonly api = inject(TailingsApiService)
  private readonly store = inject(Store)

  loadDataset$ = createEffect(() => this.actions$.pipe(
    ofType(TailingsActions.loadDataset),
    switchMap(() => this.api.loadDataset().pipe(
      map((dataset) => TailingsActions.loadDatasetSuccess({ dataset })),
      catchError((error: Error) => of(TailingsActions.loadDatasetFailure({ error: error.message })))
    ))
  ))

  /** 重算引擎：阈值冻结/发起/恢复后，只要还有进行中任务就按节拍推进断点 */
  recalcEngine$ = createEffect(() => this.actions$.pipe(
    ofType(TailingsActions.submitThresholdDraft, TailingsActions.requestRecalc, TailingsActions.resumeRecalc, TailingsActions.recalcTick),
    delay(450),
    withLatestFrom(this.store.select(selectRecalcJobs)),
    filter(([, jobs]) => jobs.some((job) => job.status === '进行中')),
    map(() => TailingsActions.recalcTick())
  ))
}
