import { ChevronLeft, ChevronRight, Copy, Plus, UtensilsCrossed } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { PageHeader } from '../../layout/PageHeader.tsx'
import { PageLoading } from '../../layout/PageLoading.tsx'
import { errorText } from '../../lib/api.ts'
import { useI18n } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { EmptyState } from '../../ui/EmptyState.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { Skeleton } from '../../ui/Skeleton.tsx'
import { currentMonthKey, monthKeyToParam, monthLong, monthName, paramToMonthKey, shiftMonth } from '../budget/month-key.ts'
import { foodApi, type EmptyFoodMonth, type FoodMonth, type FoodMonthData, type FoodPurchase } from './food-api.ts'
import { formatRange } from './food-format.ts'
import { CurrentWeekPanel, MerchantsPanel, MonthPanel, SourcesPanel } from './FoodSummary.tsx'
import { PurchaseDialog } from './PurchaseDialog.tsx'
import { PurchaseList } from './PurchaseList.tsx'
import { SourcesDialog } from './SourcesDialog.tsx'
import { WeekList } from './WeekList.tsx'

/* /mancare/:month (MM-YY): a month's food budget. Without a month, or with
   one that is not a month, it opens the month whose money today belongs to:
   with a payday rule, early October is still September. The server works
   out the whole screen for the browser's date; after each change it is read
   again. */

export function FoodPage() {
  const { month } = useParams()
  const monthKey = month ? paramToMonthKey(month) : null
  if (!monthKey) return <CurrentFoodMonth />
  return <FoodMonthView key={monthKey} monthKey={monthKey} />
}

function CurrentFoodMonth() {
  const [target, setTarget] = useState<string | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    foodApi
      .current(controller.signal)
      .then((answer) => { setTarget(answer.monthKey) })
      .catch(() => {
        if (!controller.signal.aborted) setTarget(currentMonthKey())
      })
    return () => { controller.abort() }
  }, [])
  return target ? <Navigate to={`/mancare/${monthKeyToParam(target)}`} replace /> : <PageLoading />
}

type Open = { dialog: 'sources' } | { dialog: 'purchase'; purchase: FoodPurchase | null } | null

function FoodMonthView({ monthKey }: { monthKey: string }) {
  const { t, language } = useI18n()
  const [data, setData] = useState<FoodMonthData | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [open, setOpen] = useState<Open>(null)
  const [week, setWeek] = useState<number | null>(null)

  const load = useCallback(
    (signal?: AbortSignal) =>
      foodApi
        .month(monthKey, signal)
        .then((next) => {
          setData(next)
          setLoadError(null)
        })
        .catch((error: unknown) => {
          if (!signal?.aborted) setLoadError(error)
        }),
    [monthKey],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => { controller.abort() }
  }, [load])

  const editSources = () => { setOpen({ dialog: 'sources' }) }
  const addPurchase = () => { setOpen({ dialog: 'purchase', purchase: null }) }

  let body
  if (loadError !== null && !data) {
    body = (
      <>
        <Notice tone="error">
          {t('food.loadFailed')} {errorText(loadError, t)}
        </Notice>
        <Button variant="quiet" className="mt-2" onClick={() => void load()}>
          {t('common.tryAgain')}
        </Button>
      </>
    )
  } else if (!data) {
    body = <FoodSkeleton />
  } else if (!data.exists) {
    body = <SetupState data={data} onStart={editSources} />
  } else {
    body = (
      <MonthLayout
        data={data}
        week={week}
        onWeek={setWeek}
        onEditSources={editSources}
        onAdd={addPurchase}
        onOpen={(purchase) => { setOpen({ dialog: 'purchase', purchase }) }}
      />
    )
  }

  const navClass = 'grid size-11 pointer-fine:size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink [&_svg]:size-5'
  const period = data?.period
  return (
    <>
      <PageHeader
        title={t('food.title')}
        subtitle={t('food.subtitle')}
        action={
          <div className="flex items-center gap-1 self-start sm:self-auto">
            <Link
              to={`/mancare/${monthKeyToParam(shiftMonth(monthKey, -1))}`}
              replace
              aria-label={t('food.previousMonth')}
              title={t('food.previousMonth')}
              className={navClass}
            >
              <ChevronLeft aria-hidden="true" />
            </Link>
            <p className="min-w-36 text-center leading-tight" aria-live="polite">
              <span className="block font-semibold">{monthLong(monthKey, language)}</span>
              {/* Only worth a line when the money does not follow the calendar month. */}
              {period && !period.start.endsWith('-01') && (
                <span className="block text-xs text-muted">{formatRange(period.start, period.end, language)}</span>
              )}
            </p>
            <Link
              to={`/mancare/${monthKeyToParam(shiftMonth(monthKey, 1))}`}
              replace
              aria-label={t('food.nextMonth')}
              title={t('food.nextMonth')}
              className={navClass}
            >
              <ChevronRight aria-hidden="true" />
            </Link>
          </div>
        }
      />

      {body}

      {data?.exists && (
        <button
          type="button"
          onClick={addPurchase}
          aria-label={t('food.addPurchase')}
          title={t('food.addPurchase')}
          className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 flex min-h-12 items-center gap-2 rounded-full shadow-lg bg-brand px-5 font-semibold text-on-brand transition-opacity duration-150 hover:opacity-90 sm:right-6 sm:bottom-6"
        >
          <Plus aria-hidden="true" className="size-5" />
          {t('food.purchaseShort')}
        </button>
      )}

      {data && open?.dialog === 'sources' && (
        <SourcesDialog data={data} onClose={() => { setOpen(null) }} onSaved={setData} />
      )}
      {data?.exists && open?.dialog === 'purchase' && (
        <PurchaseDialog
          monthKey={monthKey}
          period={data.period}
          sources={data.sources}
          usedMerchants={data.merchants.map((m) => m.name)}
          purchase={open.purchase}
          onClose={() => { setOpen(null) }}
          onSaved={() => void load()}
        />
      )}
    </>
  )
}

/* One column on a phone in reading order; from lg the summaries move to a side
   column. `contents` lets the same elements take part in either layout. */
interface MonthLayoutProps {
  data: FoodMonth
  week: number | null
  onWeek: (week: number | null) => void
  onEditSources: () => void
  onAdd: () => void
  onOpen: (purchase: FoodPurchase) => void
}

function MonthLayout({ data, week, onWeek, onEditSources, onAdd, onOpen }: MonthLayoutProps) {
  const current = data.currentWeek
  const laterWeeks = current ? data.weeks.filter((w) => w.index > current.index).length : 0
  const filter = week === null ? null : data.weeks.find((w) => w.index === week)
  const purchases = filter ? data.purchases.filter((p) => p.spentOn >= filter.start && p.spentOn <= filter.end) : data.purchases
  return (
    <div className="grid gap-4 pb-20 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="contents lg:flex lg:flex-col lg:gap-4">
        {current ? <CurrentWeekPanel week={current} laterWeeks={laterWeeks} /> : <MonthPanel data={data} compact={false} />}
        <div className="order-3 lg:order-none">
          <WeekList weeks={data.weeks} selected={week} onSelect={onWeek} />
        </div>
        <div className="order-5 lg:order-none">
          <PurchaseList
            purchases={purchases}
            week={filter ? week : null}
            showSource={data.sources.length > 1}
            onClearWeek={() => { onWeek(null) }}
            onAdd={onAdd}
            onOpen={onOpen}
          />
        </div>
      </div>
      <div className="contents lg:flex lg:flex-col lg:gap-4">
        {current && (
          <div className="order-1 lg:order-none">
            <MonthPanel data={data} compact />
          </div>
        )}
        <div className="order-2 lg:order-none">
          <SourcesPanel data={data} onEdit={onEditSources} />
        </div>
        <div className="order-4 lg:order-none">
          <MerchantsPanel data={data} />
        </div>
      </div>
    </div>
  )
}

function SetupState({ data, onStart }: { data: EmptyFoodMonth; onStart: () => void }) {
  const { t, language } = useI18n()
  const from = data.suggestedSources.length > 0 ? data.suggestedFrom : null
  return (
    <EmptyState
      icon={<UtensilsCrossed />}
      title={t('food.setupTitle')}
      action={
        <Button onClick={onStart}>
          {from ? <Copy /> : <Plus />}
          {from ? t('food.startFrom', { month: monthLong(from, language) }) : t('food.setBudget')}
        </Button>
      }
    >
      {t('food.setupText', {
        month: monthName(data.monthKey, language),
        range: formatRange(data.period.start, data.period.end, language),
      })}
    </EmptyState>
  )
}

function FoodSkeleton() {
  const { t } = useI18n()
  return (
    <div aria-busy="true" aria-label={t('common.loading')} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex flex-col gap-4">
        <div className="card p-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-4 h-10 w-48" />
          <Skeleton className="mt-5 h-2 w-full" />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  )
}
