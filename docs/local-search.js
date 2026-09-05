/**
 * Local docs search fallback for Mintlify preview when `mint login` is not active.
 * Mintlify auto-loads every .js file in the docs content directory.
 */
(() => {
  const MAX_RESULTS = 12;
  let pages = [];
  let indexReady = false;
  let open = false;

  const css = `
    #reconai-local-search-root {
      position: fixed;
      inset: 0;
      z-index: 2147483000;
      display: none;
      align-items: flex-start;
      justify-content: center;
      padding: 12vh 16px 16px;
      background: rgba(0, 0, 0, 0.55);
      backdrop-filter: blur(2px);
    }
    #reconai-local-search-root[data-open="true"] { display: flex; }
    #reconai-local-search-panel {
      width: min(640px, 100%);
      max-height: min(70vh, 560px);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: #121212;
      color: #f5f5f5;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
      font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    }
    #reconai-local-search-panel header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    #reconai-local-search-panel header svg { opacity: 0.55; flex: 0 0 auto; }
    #reconai-local-search-input {
      flex: 1;
      min-width: 0;
      border: 0;
      outline: none;
      background: transparent;
      color: inherit;
      font-size: 16px;
    }
    #reconai-local-search-input::placeholder { color: rgba(255, 255, 255, 0.4); }
    #reconai-local-search-kbd {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.45);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 6px;
      padding: 2px 6px;
    }
    #reconai-local-search-results {
      overflow: auto;
      padding: 8px;
    }
    .reconai-search-empty {
      padding: 24px 12px;
      text-align: center;
      color: rgba(255, 255, 255, 0.5);
      font-size: 14px;
    }
    .reconai-search-item {
      display: block;
      text-decoration: none;
      color: inherit;
      border-radius: 10px;
      padding: 10px 12px;
      margin-bottom: 2px;
    }
    .reconai-search-item[data-active="true"],
    .reconai-search-item:hover {
      background: rgba(232, 97, 60, 0.16);
    }
    .reconai-search-item strong {
      display: block;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 2px;
    }
    .reconai-search-item span {
      display: block;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.55);
      line-height: 1.4;
    }
    .reconai-search-item em {
      font-style: normal;
      color: rgba(255, 255, 255, 0.35);
      font-size: 11px;
    }
  `;

  function scorePage(page, terms) {
    const title = page.title.toLowerCase();
    const desc = (page.description || "").toLowerCase();
    const headings = (page.headings || []).join(" ").toLowerCase();
    const text = (page.text || "").toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (!term) continue;
      if (title === term) score += 100;
      if (title.includes(term)) score += 40;
      if (desc.includes(term)) score += 20;
      if (headings.includes(term)) score += 15;
      if (text.includes(term)) score += 5;
      if (!title.includes(term) && !desc.includes(term) && !headings.includes(term) && !text.includes(term)) {
        return 0;
      }
    }
    return score;
  }

  function search(query) {
    const terms = query
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!terms.length) {
      return pages.slice(0, MAX_RESULTS).map((p) => ({ ...p, score: 1 }));
    }
    return pages
      .map((p) => ({ ...p, score: scorePage(p, terms) }))
      .filter((p) => p.score > 0)
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
      .slice(0, MAX_RESULTS);
  }

  function ensureUi() {
    if (document.getElementById("reconai-local-search-root")) return;

    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    const root = document.createElement("div");
    root.id = "reconai-local-search-root";
    root.innerHTML = `
      <div id="reconai-local-search-panel" role="dialog" aria-modal="true" aria-label="Search documentation">
        <header>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="7"></circle>
            <path d="M20 20l-3.5-3.5"></path>
          </svg>
          <input id="reconai-local-search-input" type="search" placeholder="Search documentation..." autocomplete="off" />
          <span id="reconai-local-search-kbd">Esc</span>
        </header>
        <div id="reconai-local-search-results"></div>
      </div>
    `;
    document.body.appendChild(root);

    root.addEventListener("click", (e) => {
      if (e.target === root) closeSearch();
    });

    const input = document.getElementById("reconai-local-search-input");
    input.addEventListener("input", () => renderResults(input.value));
    input.addEventListener("keydown", (e) => {
      const items = [...document.querySelectorAll(".reconai-search-item")];
      const active = items.findIndex((el) => el.dataset.active === "true");
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = items[(active + 1 + items.length) % Math.max(items.length, 1)];
        items.forEach((el) => (el.dataset.active = "false"));
        if (next) next.dataset.active = "true";
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = items[(active - 1 + items.length) % Math.max(items.length, 1)];
        items.forEach((el) => (el.dataset.active = "false"));
        if (prev) prev.dataset.active = "true";
      } else if (e.key === "Enter") {
        const target = items.find((el) => el.dataset.active === "true") || items[0];
        if (target) {
          e.preventDefault();
          window.location.href = target.getAttribute("href");
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeSearch();
      }
    });
  }

  function snippetFor(page, query) {
    if (page.description) return page.description;
    const term = query.toLowerCase().trim().split(/\s+/).filter(Boolean)[0];
    const text = page.text || "";
    if (!term) return (page.headings && page.headings[0]) || page.href;
    const idx = text.toLowerCase().indexOf(term);
    if (idx < 0) return (page.headings && page.headings[0]) || page.href;
    const start = Math.max(0, idx - 40);
    const end = Math.min(text.length, idx + 80);
    return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
  }

  function renderResults(query) {
    const box = document.getElementById("reconai-local-search-results");
    if (!box) return;
    if (!indexReady) {
      box.innerHTML = `<div class="reconai-search-empty">Loading search index…</div>`;
      return;
    }
    const results = search(query);
    if (!results.length) {
      box.innerHTML = `<div class="reconai-search-empty">No results for “${query.replace(/[<>&]/g, "")}”</div>`;
      return;
    }
    box.innerHTML = results
      .map(
        (page, i) => `
      <a class="reconai-search-item" href="${page.href}" data-active="${i === 0 ? "true" : "false"}">
        <strong>${page.title}</strong>
        <span>${snippetFor(page, query)}</span>
        <em>${page.href}</em>
      </a>`,
      )
      .join("");
  }

  function dismissMintlifySearch() {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    document.querySelectorAll('[role="listbox"], [cmdk-dialog], [data-radix-dialog-overlay]').forEach((el) => {
      if (el.getAttribute("role") === "listbox") {
        const dialog = el.closest("[role='dialog']") || el.parentElement;
        if (dialog && dialog !== document.body) dialog.style.display = "none";
      }
    });
  }

  function openSearch(prefill = "") {
    ensureUi();
    dismissMintlifySearch();
    const root = document.getElementById("reconai-local-search-root");
    const input = document.getElementById("reconai-local-search-input");
    root.dataset.open = "true";
    open = true;
    input.value = prefill;
    renderResults(prefill);
    requestAnimationFrame(() => input.focus());
  }

  function closeSearch() {
    const root = document.getElementById("reconai-local-search-root");
    if (!root) return;
    root.dataset.open = "false";
    open = false;
  }

  function mintSearchDisabled() {
    if (document.documentElement.dataset.reconaiLocalSearch === "1") return true;
    const triggers = [
      ...document.querySelectorAll("#search-bar-entry, #search-bar-entry-mobile"),
    ];
    const fromTrigger = triggers.some((el) => /mint login/i.test(el.textContent || ""));
    const fromBody = /Run mint login in the cli to activate search/i.test(document.body?.innerText || "");
    if (fromTrigger || fromBody) {
      document.documentElement.dataset.reconaiLocalSearch = "1";
      return true;
    }
    return false;
  }

  function relabelSearchTriggers() {
    if (!mintSearchDisabled()) return;
    for (const sel of ["#search-bar-entry", "#search-bar-entry-mobile"]) {
      document.querySelectorAll(sel).forEach((el) => {
        // Keep icon; replace the disabled Mintlify copy with a normal search hint.
        [...el.childNodes]
          .filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim())
          .forEach((n) => {
            n.textContent = "";
          });
        // Clear Mintlify's disabled helper text nodes inside spans
        el.querySelectorAll("span, p, div").forEach((node) => {
          if (/mint login/i.test(node.textContent || "")) node.textContent = "";
        });
        let label = el.querySelector("[data-reconai-search-label]");
        if (!label) {
          label = document.createElement("span");
          label.dataset.reconaiSearchLabel = "1";
          el.appendChild(label);
        }
        label.textContent = "Search...";
        let kbd = el.querySelector("[data-reconai-search-kbd]");
        if (!kbd) {
          kbd = document.createElement("kbd");
          kbd.dataset.reconaiSearchKbd = "1";
          kbd.style.cssText =
            "margin-left:8px;font-size:11px;opacity:.55;border:1px solid rgba(127,127,127,.35);border-radius:4px;padding:1px 5px;";
          el.appendChild(kbd);
        }
        kbd.textContent = navigator.platform?.includes("Mac") ? "⌘K" : "Ctrl K";
      });
    }
  }

  function wireTriggers() {
    const handler = (e) => {
      if (!mintSearchDisabled()) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      openSearch();
    };

    const attach = () => {
      relabelSearchTriggers();
      for (const sel of ["#search-bar-entry", "#search-bar-entry-mobile", 'button[aria-label="Open search"]']) {
        document.querySelectorAll(sel).forEach((el) => {
          if (el.dataset.reconaiSearchBound === "1") return;
          el.dataset.reconaiSearchBound = "1";
          el.addEventListener("pointerdown", handler, true);
          el.addEventListener("click", handler, true);
        });
      }
    };

    attach();
    const obs = new MutationObserver(attach);
    obs.observe(document.documentElement, { childList: true, subtree: true });

    document.addEventListener(
      "keydown",
      (e) => {
        const meta = e.metaKey || e.ctrlKey;
        if (meta && e.key.toLowerCase() === "k" && mintSearchDisabled()) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          if (open) closeSearch();
          else openSearch();
        }
        if (e.key === "Escape" && open) {
          e.preventDefault();
          closeSearch();
        }
      },
      true,
    );
  }

  function adoptIndex() {
    const data = window.__RECONAI_SEARCH_INDEX__;
    if (!data || !Array.isArray(data.pages)) return false;
    pages = data.pages;
    indexReady = true;
    return true;
  }

  function loadIndex() {
    if (adoptIndex()) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (adoptIndex() || attempts > 40) clearInterval(timer);
    }, 100);
  }

  function boot() {
    wireTriggers();
    loadIndex();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
