export const mockDishes = [];

// No hardcoded mock tables — tables are only created by the admin via TableManager.
export const mockTables = [];

const ADMIN_DISHES_KEY = 'hotel-menu-dishes';
const ADMIN_TABLES_KEY = 'hotel-menu-tables';

export function loadPersistedAdminData() {
  try {
    const raw = JSON.parse(localStorage.getItem(ADMIN_DISHES_KEY) || 'null');
    const dishes = Array.isArray(raw)
      ? raw.filter(d => !['dish-1', 'dish-2', 'dish-3', 'dish-4'].includes(d?.id) && d?.name !== 'Truffle Pasta' && d?.name !== 'Crispy Corn Bowl' && d?.name !== 'Mango Cheesecake')
      : [];
    return {
      dishes,
      tables: JSON.parse(localStorage.getItem(ADMIN_TABLES_KEY) || 'null') || mockTables,
      theme_config: JSON.parse(localStorage.getItem('hotel_theme_config') || 'null')
    };
  } catch (error) {
    return { dishes: [], tables: mockTables, theme_config: null };
  }
}

export function savePersistedAdminData(nextDishes, nextTables) {
  try {
    localStorage.setItem(ADMIN_DISHES_KEY, JSON.stringify(nextDishes));
    localStorage.setItem(ADMIN_TABLES_KEY, JSON.stringify(nextTables));
    window.dispatchEvent(new CustomEvent('hotel-menu-data-updated'));
    return { dishes: nextDishes, tables: nextTables };
  } catch (error) {
    console.error('Failed to save menu data', error);
    return { dishes: nextDishes, tables: nextTables };
  }
}
