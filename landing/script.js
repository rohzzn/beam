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

// Update once a real GitHub Release exists: this points at the latest
// release's assets page, which is stable even as the version number changes.
const RELEASE_URL = 'https://github.com/REPLACE_ME/beam/releases/latest'
document.querySelectorAll('#download-btn').forEach((el) => {
  el.href = RELEASE_URL
})
