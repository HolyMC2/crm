import type { UnavailableTime } from './types'

/** Half-open intervals keep a booking ending at a block's start available. */
export function timeUnavailable(blocks: readonly UnavailableTime[], resourceId: string, start: number, end: number) {
  return blocks.some(block => block.resourceIds.includes(resourceId) && Date.parse(block.start) < end && start < Date.parse(block.end))
}
