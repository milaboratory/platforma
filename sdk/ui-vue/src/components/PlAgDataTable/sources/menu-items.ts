import type { DefaultMenuItem, MenuItemDef } from "ag-grid-enterprise";

export function defaultMainMenuItems(): (MenuItemDef | DefaultMenuItem)[] {
  return ["sortDescending", "sortAscending", "separator", "pinSubMenu"];
}
