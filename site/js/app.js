import './modules/index.js';
import { listPhotoNutritionSources, NUTRITION_ENTRY_FIELDS, registerPhotoNutritionSource } from './nutrition-photo.js';
import { boot } from './shell.js';
import { addNutrition } from './store.js';

window.FamilyDashboard = {
  nutrition: {
    registerPhotoSource: registerPhotoNutritionSource,
    listPhotoSources: listPhotoNutritionSources,
    entryFields: NUTRITION_ENTRY_FIELDS,
    saveEntry: (entry) => addNutrition({
      ...entry,
      source: entry.source || 'photo',
      is_estimate: entry.is_estimate !== false,
    }),
  },
};

boot();
