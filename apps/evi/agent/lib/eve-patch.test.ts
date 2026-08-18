import { describe, expect, it } from 'vitest'

// Guards the eve patch in patches/: the workflow runtime must tolerate ULID
// event ids, because the production World does not allocate slot-numbered ids
// yet. The chunk filename is version-specific on purpose — an eve upgrade
// breaks this import, which is the cue to re-check whether the patch is still
// needed and re-apply it.
const chunk = new URL('../../node_modules/eve/dist/src/compiled/_chunks/workflow/wait-until-BPSgt1Wg.js', import.meta.url)

const ULID_EVENTS = [
  { eventId: 'evnt_01M09KWV3QQ18TDMH26BYJNNKK' },
  { eventId: 'evnt_01M09KWV3QQ18TDMH26BYJNNKM' },
]
const SLOT_EVENTS = [
  { eventId: 'evnt_00000000000000000000000001' },
  { eventId: 'evnt_00000000000000000000000003' },
]

describe('patched workflow slot snapshot', () => {
  it('returns an empty snapshot for ULID event ids instead of throwing', async () => {
    const { v: buildSlotSnapshot } = await import(chunk.href)
    expect(buildSlotSnapshot(ULID_EVENTS)).toEqual({})
  })

  it('still tracks the event count for slot-numbered ids', async () => {
    const { v: buildSlotSnapshot } = await import(chunk.href)
    expect(buildSlotSnapshot(SLOT_EVENTS)).toEqual({ eventCount: 3 })
    expect(buildSlotSnapshot([...ULID_EVENTS, ...SLOT_EVENTS])).toEqual({ eventCount: 3 })
  })
})
