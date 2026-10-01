
let numericPrefix = null; // consumed by next variable command
let focusN = null; // null = unfocused
const PEEK_TIMEOUT = 1200; // ms
let peekTimer = null;

const isPinned = (t) => t.pinned;

async function getUnpinnedTabs(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  return tabs.filter(t => !isPinned(t)).sort((a,b)=>a.index-b.index);
}

async function applyFocus(windowId) {
  const tabs = await getUnpinnedTabs(windowId);
  if (focusN === null) {
    await chrome.tabs.show(tabs.map(t => t.id));
    return;
  }
  const visible = tabs.slice(-focusN).map(t => t.id);
  const hidden = tabs.slice(0, -focusN).map(t => t.id);
  if (hidden.length) await chrome.tabs.hide(hidden);
  if (visible.length) await chrome.tabs.show(visible);
}

function consumeN(defaultN) {
  const n = numericPrefix ?? defaultN;
  numericPrefix = null;
  return n;
}

chrome.commands.onCommand.addListener(async (command) => {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!active) return;
  const windowId = active.windowId;

  // Numeric prefix setters
  if (command.startsWith('setN')) {
    numericPrefix = Number(command.replace('setN',''));
    return;
  }

  if (command === 'push') {
    numericPrefix = null;
    await chrome.tabs.create({ windowId, index: active.index + 1, active: true });
    await applyFocus(windowId);
  }

  if (command === 'pop') {
    numericPrefix = null;
    const tabs = await getUnpinnedTabs(windowId);
    if (tabs.length <= 1) return;
    const idx = tabs.findIndex(t => t.id === active.id);
    if (idx <= 0) return;
    const prev = tabs[idx - 1];
    await chrome.tabs.remove(active.id);
    await chrome.tabs.update(prev.id, { active: true });
    await applyFocus(windowId);
  }

  if (command === 'swap') {
    numericPrefix = null;
    const tabs = await getUnpinnedTabs(windowId);
    if (tabs.length < 2) return;
    const a = tabs[tabs.length - 1];
    const b = tabs[tabs.length - 2];
    await chrome.tabs.move(b.id, { index: a.index });
    await chrome.tabs.move(a.id, { index: b.index });
    await chrome.tabs.update(b.id, { active: true });
    await applyFocus(windowId);
  }

  if (command === 'dup') {
    numericPrefix = null;
    await chrome.tabs.duplicate(active.id);
    await applyFocus(windowId);
  }

  if (command === 'rotate') {
    const tabs = await getUnpinnedTabs(windowId);
    const n = consumeN(3);
    if (tabs.length < n) return;
    const slice = tabs.slice(-n);
    const indices = slice.map(t => t.index);
    for (let i = 0; i < slice.length; i++) {
      const newIndex = indices[(i - 1 + indices.length) % indices.length];
      await chrome.tabs.move(slice[i].id, { index: newIndex });
    }
    await chrome.tabs.update(slice[0].id, { active: true });
    await applyFocus(windowId);
  }

  if (command === 'drop') {
    const tabs = await getUnpinnedTabs(windowId);
    const n = consumeN(1);
    if (tabs.length <= n) return;
    const toDrop = tabs.slice(-n).map(t => t.id);
    const remain = tabs[tabs.length - n - 1];
    await chrome.tabs.remove(toDrop);
    await chrome.tabs.update(remain.id, { active: true });
    await applyFocus(windowId);
  }

  if (command === 'peek') {
    const tabs = await getUnpinnedTabs(windowId);
    const n = consumeN(3);
    if (tabs.length < 2) return;
    const slice = tabs.slice(-n).reverse();
    let delay = 0;
    for (const tab of slice) {
      setTimeout(() => chrome.tabs.update(tab.id, { active: true }), delay);
      delay += 200;
    }
    if (peekTimer) clearTimeout(peekTimer);
    peekTimer = setTimeout(() => chrome.tabs.update(active.id, { active: true }), PEEK_TIMEOUT);
  }

  if (command === 'focus') {
    focusN = consumeN(3);
    await applyFocus(windowId);
  }

  if (command === 'unfocus') {
    numericPrefix = null;
    focusN = null;
    await applyFocus(windowId);
  }
});
