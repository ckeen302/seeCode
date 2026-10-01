// Sidebar collapsed/expanded choice (Section 5: 64 px collapsed, 220 px expanded).
// CSS reads `data-sidebar` on <html>, set before first paint by SIDEBAR_INIT_SCRIPT.

export const SIDEBAR_STORAGE_KEY = "seecode:sidebar"

export const SIDEBAR_INIT_SCRIPT = `(function(){try{if(localStorage.getItem(${JSON.stringify(
  SIDEBAR_STORAGE_KEY
)})==="collapsed")document.documentElement.setAttribute("data-sidebar","collapsed")}catch(e){}})()`

const listeners = new Set<() => void>()

export function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "collapsed"
  } catch {
    return false
  }
}

export function subscribeSidebar(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function applySidebar(collapsed: boolean): void {
  if (collapsed) document.documentElement.setAttribute("data-sidebar", "collapsed")
  else document.documentElement.removeAttribute("data-sidebar")
}

export function setSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "collapsed" : "expanded")
  } catch {
    // Storage unavailable: the choice lasts for this page only.
  }
  applySidebar(collapsed)
  listeners.forEach((listener) => listener())
}
