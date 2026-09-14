// Read-only DOM support. The class flow and input dispatch remain in cdp.mjs.
// Pure matcher: only the first title SPAN of a plugin row may name an app.
export function matchAppSelectionRow(row, knownLabels) {
  if (!row || !Array.isArray(knownLabels) || new Set(knownLabels).size !== knownLabels.length) return null;
  const plugin = row.closest('[data-composer-plugin-impression-id]');
  const group = row.closest('[role="group"]');
  if (!plugin || !group || !row.matches('[data-fill][tabindex], .__menu-item[tabindex]')
    || !(plugin.contains(group) || group.contains(plugin))
    || row.closest('article, [data-message-author-role], [data-testid^="conversation-turn"], nav, aside, [role="navigation"], [role="complementary"], [data-sidebar-item], [data-testid*="sidebar"]')) return null;
  const title = row.querySelector('span');
  if (!title) return null;
  const label = (title.textContent ?? '').trim().replace(/\s+/g, ' ');
  return knownLabels.includes(label) ? label : null;
}

function observeAppSelection(knownLabels, labelWanted, ownedScratchQuery, matchRow) {
  const excluded = 'article, [data-message-author-role], [data-testid^="conversation-turn"], nav, aside, [role="navigation"], [role="complementary"], [data-sidebar-item], [data-testid*="sidebar"]';
  const base = {
    composerFound: false, composerAmbiguous: false, composerFormFound: false, composerEmpty: false, scratchQueryOwned: false,
    toolsControlCount: 0, toolsExpanded: false, toolsRect: null, chipCounts: {}, chipMatchCount: 0, chipRect: null,
    legacyChipMatchCount: 0, inlineChipMatchCount: 0, inlineChipTotalCount: 0, inlineChipCounts: {},
    visibleMenuCount: 0, moreMatchCount: 0, moreRect: null, appMatchCount: 0, renderedAppMatchCount: 0,
    appRect: null, availableAppLabels: [], scrollCandidate: null, duplicateAppLabels: [], blocked: false, blockReason: null,
  };
  const blocked = (reason) => ({ ...base, toolsRect: null, chipRect: null, moreRect: null, appRect: null,
    scrollCandidate: null, blocked: true, blockReason: reason });
  if (!Array.isArray(knownLabels) || knownLabels.length === 0
    || knownLabels.some((label) => typeof label !== 'string' || !label || label !== label.trim() || /\s{2,}|[\r\n]/.test(label))
    || new Set(knownLabels).size !== knownLabels.length || (labelWanted != null && !knownLabels.includes(labelWanted))) return blocked('APP_LABELS_INVALID');
  if (ownedScratchQuery !== undefined && (typeof ownedScratchQuery !== 'string'
    || !knownLabels.includes(ownedScratchQuery)
    || (labelWanted != null && ownedScratchQuery !== labelWanted))) return blocked('SCRATCH_QUERY_INVALID');
  const all = (root, selector) => [...new Set(root.querySelectorAll(selector))];
  const rendered = (element) => {
    if (!element || element.closest(excluded) || !element.getClientRects().length) return false;
    for (let current = element; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (current.hidden || current.hasAttribute('inert') || current.getAttribute('aria-hidden') === 'true'
        || style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility) || style.opacity === '0') return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const box = (element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  };
  const visibleRect = (element) => {
    if (!rendered(element)) return null;
    const rect = element.getBoundingClientRect();
    let left = Math.max(0, rect.left), top = Math.max(0, rect.top);
    let right = Math.min(innerWidth, rect.right), bottom = Math.min(innerHeight, rect.bottom);
    for (let current = element.parentElement; current; current = current.parentElement) {
      const style = getComputedStyle(current), bounds = current.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(style.overflowX || style.overflow || '')) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
      if (/(auto|scroll|hidden|clip)/.test(style.overflowY || style.overflow || '')) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
    }
    return right > left && bottom > top ? { x: left, y: top, width: right - left, height: bottom - top } : null;
  };
  const visible = (element) => visibleRect(element) !== null;
  const enabled = (element) => !element.disabled && element.getAttribute('aria-disabled') !== 'true';
  const labelOf = (element) => (element.getAttribute('aria-label') || element.innerText || element.textContent || '').trim().replace(/\s+/g, ' ');
  const composers = all(document, '#prompt-textarea, [data-testid="prompt-textarea"], textarea[aria-label="Chat with ChatGPT"]').filter(visible);
  base.composerFound = composers.length > 0; base.composerAmbiguous = composers.length > 1;
  if (composers.length !== 1) return blocked(composers.length ? 'COMPOSER_AMBIGUOUS' : 'COMPOSER_MISSING');
  const composer = composers[0], form = composer.closest('form');
  base.composerFormFound = Boolean(form);
  if (!form || form.closest(excluded)) return blocked('COMPOSER_FORM_MISSING');
  const inlinePills = all(composer, '[data-inline-selection-pill]');
  const inlineAppLabels = inlinePills.map((element) => {
    const label = element.getAttribute('data-keyword');
    const hint = element.getAttribute('data-system-hint-type');
    const links = [...element.querySelectorAll('a')];
    const linkText = links.length === 1 ? (links[0].innerText ?? links[0].textContent ?? '').trim().replace(/\s+/g, ' ') : null;
    return element.getAttribute('contenteditable') === 'false' && knownLabels.includes(label)
      && typeof hint === 'string' && hint.startsWith('plugin:') && linkText === label ? label : null;
  });
  if (inlineAppLabels.some((label) => label === null)) return blocked('APP_INLINE_PILL_INVALID_OR_UNKNOWN');
  let text;
  if (typeof composer.value === 'string') text = composer.value;
  else {
    const clone = composer.cloneNode(true);
    clone.querySelectorAll('[data-inline-selection-pill], [data-inline-selection-pill-cursor-target]').forEach((element) => element.remove());
    text = clone.innerText ?? clone.textContent ?? '';
  }
  // ChatGPT inserts one editor separator after a protected inline app pill.
  // Treat only that one exact separator as structural; never trim arbitrary
  // query whitespace or accept a changed scratch value.
  const textAfterAppSeparator = inlinePills.length > 0 && /^[ \u00a0]/.test(text) ? text.slice(1) : text;
  base.composerEmpty = textAfterAppSeparator.trim() === '';
  base.scratchQueryOwned = ownedScratchQuery !== undefined && textAfterAppSeparator === ownedScratchQuery;
  if (!base.composerEmpty && !base.scratchQueryOwned) return blocked('COMPOSER_NOT_EMPTY_OR_OWNED_SCRATCH');
  const activeQuery = base.scratchQueryOwned && (document.activeElement === composer || composer.contains(document.activeElement));
  const controls = all(form, 'button[data-testid="composer-plus-btn"], button[aria-label="Tools"]').filter(visible);
  base.toolsControlCount = controls.length;
  if (controls.length !== 1 || !enabled(controls[0])) return blocked('TOOLS_CONTROL_AMBIGUOUS_OR_UNAVAILABLE');
  const tools = controls[0];
  base.toolsExpanded = tools.getAttribute('aria-expanded') === 'true'; base.toolsRect = visibleRect(tools);
  const chips = all(form, 'button').filter(visible);
  const legacyChipCounts = Object.fromEntries(knownLabels.map((label) => [label, chips.filter((chip) => chip.getAttribute('aria-label') === label + ', click to remove').length]));
  base.inlineChipCounts = Object.fromEntries(knownLabels.map((label) => [label, inlineAppLabels.filter((value) => value === label).length]));
  base.inlineChipTotalCount = inlinePills.length;
  base.chipCounts = Object.fromEntries(knownLabels.map((label) => [label, legacyChipCounts[label] + base.inlineChipCounts[label]]));
  const legacyChipMatches = labelWanted == null ? [] : chips.filter((chip) => chip.getAttribute('aria-label') === labelWanted + ', click to remove');
  const inlineChipMatches = labelWanted == null ? [] : inlinePills.filter((_pill, index) => inlineAppLabels[index] === labelWanted);
  const chipMatches = [...legacyChipMatches, ...inlineChipMatches];
  base.chipMatchCount = chipMatches.length;
  if (Object.values(base.chipCounts).some((count) => count > 1)) return blocked('APP_CHIP_AMBIGUOUS');
  base.legacyChipMatchCount = legacyChipMatches.length;
  base.inlineChipMatchCount = inlineChipMatches.length;
  base.chipRect = legacyChipMatches.length === 1 && inlineChipMatches.length === 0 && enabled(legacyChipMatches[0]) ? visibleRect(legacyChipMatches[0]) : null;
  const ids = (element, attribute) => (element.getAttribute(attribute) || '').split(/\s+/).filter(Boolean);
  const controlledIds = [...ids(tools, 'aria-controls'), ...ids(tools, 'aria-owns'), ...ids(composer, 'aria-controls')];
  let duplicateRootId = false;
  const roots = all(document, '[role="menu"], [role="listbox"], [aria-busy]').filter((root) => {
    if (!visible(root) || root.querySelector(excluded)) return false;
    const legacy = ['menu', 'listbox'].includes(root.getAttribute('role'));
    if (!legacy && !root.querySelector('[data-composer-plugin-impression-id], [role="group"] [tabindex]')) return false;
    const labelledBy = ids(root, 'aria-labelledby');
    const referenced = (root.id && controlledIds.includes(root.id))
      || [tools.id, composer.id].some((id) => id && labelledBy.includes(id));
    if (referenced && root.id && all(document, '[id]').filter((node) => node.id === root.id).length !== 1) {
      duplicateRootId = true; return false;
    }
    // An active @query alone does not authorize unrelated legacy/file menus.
    const queryBound = activeQuery && (form.contains(root) || referenced || root.querySelector('[data-composer-plugin-impression-id]'));
    return (base.toolsExpanded && (form.contains(root) || referenced)) || queryBound;
  });
  base.visibleMenuCount = roots.length;
  if (duplicateRootId) return blocked('APP_POPUP_ID_AMBIGUOUS');
  if (roots.length > 1) return blocked('APP_POPUP_AMBIGUOUS');
  if (roots.length === 0) return { ...base };
  const root = roots[0];
  if (root.getAttribute('aria-busy') === 'true') return blocked('APP_POPUP_BUSY');
  const legacyRows = ['menu', 'listbox'].includes(root.getAttribute('role'))
    ? all(root, '[role="menuitemradio"], [role="option"]').filter(rendered) : [];
  const pluginRows = all(root, '[data-composer-plugin-impression-id] [tabindex]').filter(rendered);
  const matches = new Map();
  for (const row of [...new Set([...legacyRows, ...pluginRows])]) {
    const label = row.closest('[data-composer-plugin-impression-id]') ? matchRow(row, knownLabels) : labelOf(row);
    if (knownLabels.includes(label)) matches.set(row, label);
  }
  base.duplicateAppLabels = knownLabels.filter((label) => [...matches.values()].filter((value) => value === label).length > 1);
  if (base.duplicateAppLabels.length) return blocked('APP_LABEL_AMBIGUOUS');
  base.availableAppLabels = [...matches].filter(([row]) => visible(row) && enabled(row)).map(([, label]) => label);
  const wantedRows = labelWanted == null ? [] : [...matches].filter(([, label]) => label === labelWanted).map(([row]) => row);
  base.renderedAppMatchCount = wantedRows.length;
  const visibleRows = wantedRows.filter((row) => visible(row) && enabled(row));
  base.appMatchCount = visibleRows.length; base.appRect = visibleRows.length === 1 ? visibleRect(visibleRows[0]) : null;
  const more = all(root, '[role="menuitem"]').filter((row) => visible(row) && enabled(row) && labelOf(row) === 'More');
  base.moreMatchCount = more.length;
  if (more.length > 1) return blocked('MORE_CONTROL_AMBIGUOUS');
  base.moreRect = more.length === 1 ? visibleRect(more[0]) : null;
  if (wantedRows.length === 1 && visibleRows.length === 0 && enabled(wantedRows[0])) {
    const row = wantedRows[0], rowBox = box(row);
    for (let parent = row.parentElement; parent && root.contains(parent); parent = parent.parentElement) {
      const style = getComputedStyle(parent), containerRect = visibleRect(parent);
      if (containerRect && /(auto|scroll)/.test(style.overflowY || style.overflow || '') && parent.scrollHeight > parent.clientHeight) {
        const direction = rowBox.y >= containerRect.y + containerRect.height ? 'down' : rowBox.y + rowBox.height <= containerRect.y ? 'up' : null;
        if (direction) base.scrollCandidate = { label: labelWanted, direction, containerRect };
        break;
      }
    }
  }
  return { ...base };
}

export function appSelectionObservation(knownLabels, labelWanted, ownedScratchQuery) {
  return observeAppSelection(knownLabels, labelWanted, ownedScratchQuery, matchAppSelectionRow);
}

// CDP receives only this source and the three JSON arguments. No module closure,
// DOM mutation, focus, keyboard dispatch, or hidden-option Enter is required.
export const APP_SELECTION_OBSERVATION_FN = `function appSelectionObservation(knownLabels, labelWanted, ownedScratchQuery) {
  const matchRow = ${matchAppSelectionRow.toString()};
  return (${observeAppSelection.toString()})(knownLabels, labelWanted, ownedScratchQuery, matchRow);
}`;
