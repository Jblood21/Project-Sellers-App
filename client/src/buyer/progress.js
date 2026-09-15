import { NEXT_STEPS, PLAN_KEYS } from '@shared/domain.js';

/** The 8-item plan model: homes-saved plus the seven tools. */
export function planProgress(lead, communityId) {
  const done = PLAN_KEYS.filter((key) =>
    key === 'homes' ? (lead?.savedHomeIds?.length ?? 0) > 0 : Boolean(lead?.plan?.[key]),
  );
  const percent = Math.round((done.length / PLAN_KEYS.length) * 100);
  const next = NEXT_STEPS.find(([key]) => !done.includes(key));
  const screenPath = (screen) =>
    screen === 'explore' ? `/c/${communityId}/explore` : `/c/${communityId}/tool/${screen}`;
  return {
    doneKeys: done,
    percent,
    nextLabel: next ? next[1] : 'You’re done — download your plan!',
    nextTo: next ? screenPath(next[2]) : `/c/${communityId}/plan`,
  };
}
