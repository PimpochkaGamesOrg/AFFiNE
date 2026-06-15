/** column default width */
export const DEFAULT_COLUMN_WIDTH = 180;
/** column min width */
export const DEFAULT_COLUMN_MIN_WIDTH = 100;
/** column title height */
export const DEFAULT_COLUMN_TITLE_HEIGHT = 34;
/** column title height */
export const DEFAULT_ADD_BUTTON_WIDTH = 40;
export const LEFT_TOOL_BAR_WIDTH = 24;
export const STATS_BAR_HEIGHT = 34;
export const DEFAULT_TABLE_ROW_HEIGHT = 34;
export const TABLE_VISIBLE_ROW_COUNT = 10;
export const TABLE_VIEWPORT_MIN_ROW_COUNT = 3;
export const TABLE_VIEWPORT_MAX_ROW_COUNT = 30;

export const getTableViewportHeight = (rowCount: number) =>
  DEFAULT_COLUMN_TITLE_HEIGHT + rowCount * DEFAULT_TABLE_ROW_HEIGHT;

export const TABLE_VIEWPORT_DEFAULT_HEIGHT = getTableViewportHeight(
  TABLE_VISIBLE_ROW_COUNT
);
export const TABLE_VIEWPORT_MIN_HEIGHT = getTableViewportHeight(
  TABLE_VIEWPORT_MIN_ROW_COUNT
);
export const TABLE_VIEWPORT_MAX_HEIGHT = getTableViewportHeight(
  TABLE_VIEWPORT_MAX_ROW_COUNT
);
