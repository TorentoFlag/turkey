export interface NavigationItem {
  label: string;
  href: string;
  children?: NavigationItem[];
}
