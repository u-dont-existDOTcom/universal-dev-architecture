/*
 * Survey draft autosave, v1 (no dependencies; Apps Script HtmlService compatible).
 * Keep this component generic. The calling survey supplies its own stable prefix.
 * Stores only in the participant's browser; it never transmits a draft to the server.
 */
(function (root) {
  'use strict';

  function createSurveyDraftAutosave(options) {
    const form = options.form;
    if (!form || !options.storagePrefix) throw new Error('form and storagePrefix required');
    const prefix = String(options.storagePrefix);
    const draftPrefix = prefix + ':draft:';
    const activeKey = prefix + ':active-tab';
    const status = options.statusElement;
    const intervalMs = options.intervalMs || 10000;
    const browser = options.window || root;
    const doc = options.document || browser.document;
    const now = options.now || function () { return Date.now(); };
    const stores = [];
    const ignored = { submittedAtClient: true, page: true };
    let lastFingerprint = '';
    let started = false;
    let paused = false;
    let timer = null;

    // Storage APIs can throw in private modes and third-party/sandboxed frames.
    ['localStorage', 'sessionStorage'].forEach(function (kind) {
      try {
        const store = options[kind] || browser[kind];
        if (!store) return;
        const testKey = prefix + ':storage-test';
        store.setItem(testKey, '1');
        store.removeItem(testKey);
        stores.push({ kind: kind, store: store });
      } catch (_) { /* This storage provider is unavailable. */ }
    });

    function show(message, isError) {
      if (!status) return;
      status.textContent = message;
      status.style.color = isError ? '#922' : '#274';
    }

    function controls() { return Array.from(form.querySelectorAll('[name]')); }
    function snapshot() {
      const values = {};
      controls().forEach(function (el) {
        if (!el.name || ignored[el.name] || el.type === 'file') return;
        if (el.type === 'checkbox') {
          if (!Array.isArray(values[el.name])) values[el.name] = [];
          if (el.checked) values[el.name].push(el.value);
        } else if (el.type === 'radio') {
          if (!(el.name in values)) values[el.name] = '';
          if (el.checked) values[el.name] = el.value;
        } else {
          values[el.name] = el.value;
        }
      });
      return values;
    }
    function fingerprint() { return JSON.stringify(snapshot()); }
    function activeId() { return String(snapshot().localReportId || ''); }
    function readRecord(provider, id) {
      if (!id) return null;
      try {
        const raw = provider.store.getItem(draftPrefix + id);
        if (!raw) return null;
        const rec = JSON.parse(raw);
        if (!rec || rec.version !== 1 || !rec.fields ||
            rec.fields.localReportId !== id || !Number.isFinite(rec.savedAt)) return null;
        return rec;
      } catch (_) { return null; }
    }
    function findSavedDraft() {
      // A refresh in the same tab should recover its own draft, even if another
      // tab is editing a different report simultaneously.
      const session = stores.find(function (s) { return s.kind === 'sessionStorage'; });
      if (session) {
        try {
          const id = session.store.getItem(activeKey);
          if (id) {
            const own = readRecord(session, id) ||
              (stores.map(function (s) { return readRecord(s, id); }).find(Boolean));
            if (own) return own;
          }
        } catch (_) { /* Scan remaining drafts. */ }
      }
      let newest = null;
      stores.forEach(function (provider) {
        try {
          const store = provider.store;
          for (let i = 0; i < store.length; i++) {
            const key = store.key(i);
            if (!key || key.slice(0, draftPrefix.length) !== draftPrefix) continue;
            const rec = readRecord(provider, key.slice(draftPrefix.length));
            if (rec && (!newest || rec.savedAt > newest.savedAt)) newest = rec;
          }
        } catch (_) { /* Ignore unavailable or malformed storage entries. */ }
      });
      return newest;
    }
    function restore() {
      const rec = findSavedDraft();
      if (!rec) return false;
      controls().forEach(function (el) {
        if (!el.name || ignored[el.name] || !(el.name in rec.fields)) return;
        const value = rec.fields[el.name];
        if (el.type === 'checkbox') {
          el.checked = Array.isArray(value) && value.indexOf(el.value) !== -1;
        } else if (el.type === 'radio') {
          el.checked = value === el.value;
        } else if (el.type !== 'file') {
          el.value = typeof value === 'string' ? value : '';
        }
      });
      started = true;
      paused = false;
      lastFingerprint = fingerprint();
      const session = stores.find(function (s) { return s.kind === 'sessionStorage'; });
      if (session) {
        try { session.store.setItem(activeKey, activeId()); } catch (_) {}
      }
      show('Unfinished answers recovered from this browser (last saved ' +
        new Date(rec.savedAt).toLocaleString() + ').');
      return true;
    }
    function saveNow(force) {
      if ((!started || paused) && !force) return false;
      const fields = snapshot();
      const id = String(fields.localReportId || '');
      if (!id) return false;
      const current = JSON.stringify(fields);
      if (current === lastFingerprint && !force) return true;
      const record = JSON.stringify({ version: 1, savedAt: now(), fields: fields });
      let saved = false;
      let savedLocally = false;
      stores.forEach(function (provider) {
        try {
          provider.store.setItem(draftPrefix + id, record);
          if (provider.kind === 'sessionStorage') provider.store.setItem(activeKey, id);
          saved = true;
          if (provider.kind === 'localStorage') savedLocally = true;
        } catch (_) { /* Another storage provider may still work. */ }
      });
      if (!saved) {
        show('Autosave unavailable in this browser. Do not reload until you submit.', true);
        return false;
      }
      lastFingerprint = current;
      show(savedLocally ? 'Draft saved on this device.' :
        'Draft saved for this tab only; keep this tab open until submission.');
      return true;
    }
    function forget(reportId) {
      stores.forEach(function (provider) {
        try {
          provider.store.removeItem(draftPrefix + reportId);
          if (provider.kind === 'sessionStorage' &&
              provider.store.getItem(activeKey) === reportId) {
            provider.store.removeItem(activeKey);
          }
        } catch (_) {}
      });
    }
    function afterSubmission(submittedId, changedDuringRequest) {
      forget(submittedId);
      lastFingerprint = '';
      if (changedDuringRequest) {
        started = true;
        paused = false;
        saveNow(true); // Current form already has a new report ID.
      } else {
        started = false;
        paused = true; // Existing form values remain visible, but are submitted.
        show('Report submitted. No unfinished draft remains on this device.');
      }
    }
    function discard() {
      forget(activeId());
      lastFingerprint = '';
      started = false;
      paused = true;
      show('Unfinished draft discarded. New answers will be saved as you type.');
    }
    function onEdit() {
      started = true;
      paused = false;
      saveNow(); // Synchronous save protects edits made just before a reload.
    }
    function start() {
      const recovered = restore();
      form.addEventListener('input', onEdit);
      form.addEventListener('change', onEdit);
      timer = browser.setInterval(function () { saveNow(); }, intervalMs);
      browser.addEventListener('pagehide', function () { saveNow(); });
      doc.addEventListener('visibilitychange', function () {
        if (doc.visibilityState === 'hidden') saveNow();
      });
      if (!stores.length) show('Autosave unavailable in this browser. Do not reload until you submit.', true);
      else if (!recovered) show('Ready. Answers save on this device as you type and every 10 seconds.');
      return recovered;
    }
    return { start: start, saveNow: saveNow, forget: forget, discard: discard,
      fingerprint: fingerprint, afterSubmission: afterSubmission };
  }

  root.createSurveyDraftAutosave = createSurveyDraftAutosave;
  if (typeof module !== 'undefined' && module.exports) module.exports = createSurveyDraftAutosave;
})(typeof window !== 'undefined' ? window : globalThis);
