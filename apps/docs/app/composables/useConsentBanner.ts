/**
 * Shared visibility of the consent banner, so the footer can reopen it after
 * a choice was stored. The banner's buttons overwrite the previous consent.
 */
export function useConsentBanner() {
  const visible = useState('consent-banner-visible', () => false)
  return {
    visible,
    open: () => {
      visible.value = true
    },
  }
}
