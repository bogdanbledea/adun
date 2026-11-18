import type { roPlans } from './plans.ro.ts'

export const enPlans: Record<keyof typeof roPlans, string> = {
  'plans.title': 'Instalment plans',
  'plans.subtitle': 'See your progress, what comes next, and which months hold each instalment.',
  'plans.loadFailed': 'The plans could not be loaded.',
  'plans.empty': 'No instalment plans',
  'plans.emptyText': 'Add a plan to follow the instalments of things you bought.',
  'plans.list': 'Your plans',

  'plans.active': 'Active',
  'plans.closed': 'Closed',
  'plans.firstInstallment': 'First instalment: {month}',
  'plans.perMonth': 'a month',
  'plans.total': 'Total',
  'plans.paid': 'Instalments paid',
  'plans.paidOf': '{paid} of {total}',
  'plans.remaining': '{count} remaining',
  'plans.addedOn': 'Added to the app: {date}',
  'plans.purchaseDateValue': 'Purchase date: {date}',
  'plans.showInstallments': 'Show the instalments of {name}',
  'plans.hideInstallments': 'Hide the instalments of {name}',
  'plans.installments': 'Instalments',
  'plans.installmentsFailed': 'The instalments could not be loaded.',
  'plans.noInstallments': 'The plan has no instalments left in the budget.',
  'plans.installmentPaid': 'paid',
  'plans.currentMonth': 'current month',
}
