const nav = document.getElementById('nav')
window.addEventListener(
  'scroll',
  () => {
    nav.classList.toggle('scrolled', window.scrollY > 8)
  },
  { passive: true }
)

const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view')
        observer.unobserve(entry.target)
      }
    }
  },
  { threshold: 0.15 }
)
document.querySelectorAll('.feature').forEach((el, i) => {
  el.style.transitionDelay = `${i * 60}ms`
  observer.observe(el)
})

// All "Download for Windows" buttons start out pointing at the releases
// page (works with zero JS, just needs one extra click). On load we look
// up the actual latest release via the GitHub API and, if it has a Windows
// installer attached, repoint every button straight at that file so the
// click triggers an immediate download instead of a page visit. This stays
// correct release after release without ever touching this file again.
const REPO = 'rohzzn/beam'
const downloadButtons = document.querySelectorAll('.js-download')

fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
  .then((res) => (res.ok ? res.json() : null))
  .then((release) => {
    const asset = release?.assets?.find((a) => a.name.endsWith('.exe'))
    if (!asset) return
    downloadButtons.forEach((el) => {
      el.href = asset.browser_download_url
      el.setAttribute('download', asset.name)
    })
  })
  .catch(() => {
    // Offline, rate-limited, or no release published yet — buttons keep
    // their releases-page fallback href from the HTML.
  })
