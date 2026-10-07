export type AdminSearchBadgeTone =
  | "success"
  | "warning"
  | "danger"
  | "muted"
  | "info";

export type AdminSearchBadge = {
  label: string;
  tone: AdminSearchBadgeTone;
};

export type AdminSearchResultItem = {
  id: string;
  title: string;
  subtitle: string;
  meta?: string;
  href: string;
  /** Short reference chip, e.g. #ABCD or PO #ABCD */
  ref?: string;
  /** Nav section label for admin pages */
  section?: string;
  thumbnailUrl?: string;
  badges?: AdminSearchBadge[];
};

export type AdminSearchGroup = {
  id: string;
  label: string;
  items: AdminSearchResultItem[];
};

export type AdminSearchIndexItem = AdminSearchResultItem & {
  group: string;
  searchText: string;
};

export type AdminSearchIndexResponse = {
  items: AdminSearchIndexItem[];
  builtAt: string;
  counts: Record<string, number>;
};

/** @deprecated Use AdminSearchIndexResponse + client filter */
export type AdminGlobalSearchResponse = {
  query: string;
  groups: AdminSearchGroup[];
};
