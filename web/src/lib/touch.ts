/* A phone or tablet: the main pointer is a finger. Focusing a field there
   opens the on-screen keyboard, which covers half of whatever just opened, so
   fields wait for a tap instead of taking focus on their own. */
export function isTouchScreen(): boolean {
  return window.matchMedia('(pointer: coarse)').matches
}
