/* Small DOM helpers shared by every part of the UI. */
export { esc } from './esc';
export const $ = <T extends HTMLElement = HTMLElement>(s: string): T => document.querySelector(s) as T;
export const mq = (q: string): boolean => !!(window.matchMedia && window.matchMedia(q).matches);
export const reduceMotion = mq('(prefers-reduced-motion: reduce)');
export const isTouch = mq('(pointer: coarse)');
