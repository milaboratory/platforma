import type { DefaultMenuItem, MenuItemDef } from 'ag-grid-enterprise';

export function defaultMainMenuItems(): (MenuItemDef | DefaultMenuItem)[] {
  return [
    'sortAscending',
    'sortDescending',
    'separator',
    'pinSubMenu',
  ];
}
