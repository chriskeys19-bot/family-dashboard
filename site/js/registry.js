/**
 * Module registry. Core layout iterates this list and never names a module.
 * A module declares id, label, dataTable, renderEntryForm, and render
 * (how its rows appear in a person's day / range).
 */
const modules = [];

export function registerModule(mod) {
  const required = ['id', 'label', 'dataTable', 'render', 'renderEntryForm'];
  for (const key of required) {
    if (mod?.[key] == null || mod[key] === '') {
      throw new Error(`Module is missing ${key}`);
    }
  }
  if (typeof mod.render !== 'function' || typeof mod.renderEntryForm !== 'function') {
    throw new Error(`Module ${mod.id} render hooks must be functions`);
  }
  if (modules.some((item) => item.id === mod.id)) {
    throw new Error(`Duplicate module ${mod.id}`);
  }
  modules.push(mod);
  modules.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id.localeCompare(b.id));
}

export function listModules() {
  return modules.slice();
}
