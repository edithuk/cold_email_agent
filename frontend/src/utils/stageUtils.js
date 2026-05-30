/**
 * Shared stage scheduling utilities.
 * Used by TemplateEditor (Compose step) and SendControls (send logic).
 */

/**
 * Returns true if the given stage should be queued to Firestore instead of
 * being sent immediately.  A stage is "scheduled" when it has either:
 *  - an absolute send date set, or
 *  - a relative delay > 0 days/hours.
 *
 * When used for Stage 0 (Initial Email) pass the stage object directly.
 * The caller is responsible for guarding idx === 0 if needed.
 *
 * @param {object} stage  – a stage object from the `stages` array
 * @returns {boolean}
 */
export function isStageScheduled(stage) {
  if (!stage) return false;
  if (stage.delayMode === 'absolute' && stage.sendAt) return true;
  if (stage.delayMode !== 'absolute') {
    return (stage.delayDays ?? 0) > 0 || (stage.delayHours ?? 0) > 0;
  }
  return false;
}
