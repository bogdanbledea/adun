import type { roReminders } from './reminders.ro.ts'

export const enReminders: Record<keyof typeof roReminders, string> = {
  'reminders.title': 'Due dates',
  'reminders.attentionOne': 'One due date needs attention now.',
  'reminders.attentionMany': '{count} due dates need attention now.',
  'reminders.loadFailed': 'The due dates could not be loaded.',
  'reminders.empty': 'No due dates',
  'reminders.emptyText': 'Add a car inspection, insurance or gas check and receive an email before it expires.',
  'reminders.emptyTextNoEmail': 'Add a car inspection, insurance or gas check and see here how long you have left.',
  'reminders.list': 'Your due dates',
  'reminders.emailOff': 'Emails are off on this server, so due dates appear only here, in the app.',
  'reminders.actionFailed': 'That did not work.',

  'reminders.kind.itp': 'ITP',
  'reminders.kind.rca': 'RCA',
  'reminders.kind.casco': 'CASCO',
  'reminders.kind.rovinieta': 'Road tax',
  'reminders.kind.revizie_gaz': 'Gas check',
  'reminders.kind.extinctor': 'Extinguisher',
  'reminders.kind.altele': 'Other',

  'reminders.expiredYesterday': 'Expired yesterday',
  'reminders.expiredDays': 'Expired {days} days ago',
  'reminders.expiredDaysDe': 'Expired {days} days ago',
  'reminders.expiresToday': 'Expires today',
  'reminders.tomorrow': 'Tomorrow',
  'reminders.inDays': 'In {days} days',
  'reminders.inDaysDe': 'In {days} days',
  'reminders.inactive': 'off',
  'reminders.delete': 'Delete {name}',

  'reminders.deleteTitle': 'Delete {name}?',
  'reminders.deleteText': 'The due date and its notification history are deleted for good. This cannot be undone.',
}
