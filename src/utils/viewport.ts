// Small helper to set a CSS variable --vh that represents 1% of the
// actual viewport height. This avoids issues on mobile where 100vh
// includes browser chrome or keyboard height and causes layout jumps.

function setVh() {
  try {
    const vh = window.innerHeight * 0.01
    document.documentElement.style.setProperty('--vh', `${vh}px`)
  } catch (e) {
    // ignore - server-side rendering or restricted env
  }
}

// Run once now
setVh()

// Update on common events that affect the visual viewport
if (typeof window !== 'undefined') {
  // Resize and orientation changes
  window.addEventListener('resize', setVh, { passive: true })
  window.addEventListener('orientationchange', setVh, { passive: true })

  // Some mobile browsers change innerHeight when keyboard appears; also
  // update when the page becomes visible again.
  window.addEventListener('focus', setVh, { passive: true })
  window.addEventListener('pageshow', setVh, { passive: true })
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') setVh()
  })
}

export {}
