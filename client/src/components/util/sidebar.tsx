import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowLeftRight,
  Barcode,
  BarChart3,
  BookOpen,
  Boxes,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardList,
  Clock,
  CookingPot,
  FileText,
  Hash,
  House,
  LogOut,
  Mail,
  Package,
  Percent,
  Printer,
  Receipt,
  RotateCcw,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Tag,
  Truck,
  UserRound,
  Users,
  Warehouse,
  X,
  type LucideIcon
} from 'lucide-react';
import { usePermissions } from '../../contexts/PermissionContext';
import { permissionForPath } from '../../utils/permissionRoutes';
import { useBranding } from '../../contexts/BrandingProvider';
import CompanyMark from '../common/CompanyMark';

/** Leaf link in the sidebar */
export type MenuLeaf = { label: string; to: string };
/** Item is either a direct link or a nested group (e.g. Categories → kitchen & recipes) */
export type MenuChild = MenuLeaf | { label: string; children: MenuLeaf[] };

type MenuItem = {
  label: string;
  to?: string;
  children?: MenuChild[];
};

const menuIcons: Record<string, LucideIcon> = {
  Home: House,
  Products: Package,
  Units: Boxes,
  'Kitchen inventory': CookingPot,
  Inventory: Boxes,
  'Recipe configuration': BookOpen,
  Categories: ClipboardList,
  Variations: Circle,
  Brands: Tag,
  'Barcode Print': Barcode,
  People: Users,
  Customers: UserRound,
  Users: Users,
  Suppliers: Truck,
  'Roles & Permissions': ShieldCheck,
  Warehouse,
  Transfers: ArrowLeftRight,
  Sale: ShoppingCart,
  Sales: Receipt,
  'Sale Returns': RotateCcw,
  'Return To Supplier': Truck,
  'Purchase / Inventory': ClipboardList,
  Purchases: ShoppingCart,
  'Purchase Returns': RotateCcw,
  'Stock Adjustments': Activity,
  Quotations: FileText,
  Expenses: Receipt,
  'Expense Categories': Tag,
  'Special Offers': Percent,
  'Z-bill': Printer,
  Reports: BarChart3,
  'Sales Reports': BarChart3,
  'Register Reports': ClipboardList,
  'Inventory Reports': Boxes,
  'Kitchen Waste Report': ChefHat,
  'Purchase Reports': ShoppingCart,
  'Expense Reports': Receipt,
  'Customer Reports': UserRound,
  'Supplier Reports': Truck,
  Settings,
  'System Settings': Settings,
  'Activity Logs': Clock,
  'Mail Settings': Mail,
  'Prefix Settings': Hash,
  'Receipt Settings': Receipt,
  Logout: LogOut
};

const MenuIcon: React.FC<{ label: string; size?: number }> = ({ label, size = 18 }) => {
  const Icon = menuIcons[label.trim()] ?? Circle;
  return <Icon size={size} aria-hidden="true" className="shrink-0" />;
};

const isMenuGroup = (child: MenuChild): child is { label: string; children: MenuLeaf[] } =>
  Array.isArray((child as { children?: MenuLeaf[] }).children);

const buildUnifiedMenu = (): MenuItem[] => [
  { label: 'Home', to: '/dashboard' },
  { label: 'Products ', children: [
    { label: 'Products', to: '/viewProducts' },
    { label: 'Units', to: '/viewUnits' },
    {
      label: 'Kitchen inventory',
      children: [
        { label: 'Inventory', to: '/kitchen/inventory' },
        { label: 'Recipe configuration', to: '/kitchen/recipes' }
      ]
    },
    { label: 'Categories', to: '/viewCategories' },
    { label: 'Variations', to: '/viewVariations' },
    { label: 'Brands', to: '/viewBrands' },
    { label: 'Barcode Print', to: '/barcode-print' }
  ]},
  { label: 'People', children: [
    { label: 'Customers', to: '/viewCustomers' },
    { label: 'Users', to: '/viewUsers' },
    { label: 'Suppliers', to: '/viewSuppliers' },
    { label: 'Roles & Permissions', to: '/viewRoles' }
  ]},
  { label: 'Warehouse', to: '/viewWarehouses' },
  { label: 'Transfers', to: '/transfers' },
  { label: 'Sale', children: [
    { label: 'Sales', to: '/viewSales' },
    { label: 'Sale Returns', to: '/saleReturns' },
    { label: 'Return To Supplier', to: '/return_to_supplier' }
  ]},
  { label: 'Purchase / Inventory', children: [
    { label: 'Purchases', to: '/purchases' },
    { label: 'Purchase Returns', to: '/viewPurchaseReturns' },
    { label: 'Return To Supplier', to: '/return_to_supplier' },
    { label: 'Stock Adjustments', to: '/viewAdjustments' }
  ]},
  { label: 'Quotations', to: '/quotations' },
  { label: 'Expenses', children: [
    { label: 'Expenses', to: '/expenses' },
    { label: 'Expense Categories', to: '/expense-categories' }
  ]},
  { label: 'Special Offers', to: '/SpecialOffers' },
  { label: 'Z-bill', to: '/reports/z-bill' },
  { label: 'Reports', children: [
    { label: 'Sales Reports', to: '/reports_sales' },
    { label: 'Register Reports', to: '/reports_register' },
    { label: 'Inventory Reports', to: '/reports/inventory' },
    { label: 'Kitchen Waste Report', to: '/reports/kitchen-waste' },
    { label: 'Purchase Reports', to: '/reports/purchase' },
    { label: 'Expense Reports', to: '/reports/expense' },
    { label: 'Customer Reports', to: '/reports_customer' },
    { label: 'Supplier Reports', to: '/reports/supplier' }
  ]},
  { label: 'Settings', children: [
    { label: 'System Settings', to: '/SystemSettings' },
    { label: 'Activity Logs', to: '/activity-logs' },
    { label: 'Mail Settings', to: '/mail-settings' },
    { label: 'Prefix Settings', to: '/PrefixSettings' },
    { label: 'Receipt Settings', to: '/ReceiptSettings' }
  ]},
  { label: 'Logout', to: '/logout' }
];

const buildRestaurantMenu = (): MenuItem[] => {
  const base = buildUnifiedMenu();
  const restaurantOnly = new Set([
    'Dine-in', 'Takeaway', 'Delivery', 'Online Orders',
    'Combos / Meal Deals', 'Happy Hours'
  ]);
  const restaurantProductItems = new Set([
    'Products', 'Base Units', 'Units', 'Kitchen inventory', 'Categories', 'Variations', 'Brands', 'Barcode Print'
  ]);
  const retailOnlyExclusions = new Set([
    'POS Sales Screen', 'Sales History', 'Returns', 'Transfers', 'Loyalty Programs'
  ]);
  
  return base
    .map(section => {
      if (!section.children) return section;
      if (section.label === 'Products ' || section.label === 'Products / Menu') {
        const productChildren = section.children.filter(child => 
          restaurantProductItems.has(child.label)
        );
        return { ...section, children: productChildren };
      }
      const filtered = section.children.filter(child =>
        restaurantOnly.has(child.label) || !retailOnlyExclusions.has(child.label)
      );
      if (section.label === 'Purchases / Inventory') {
        return { ...section, children: filtered.filter(c => c.label !== 'Transfers') };
      }
      return { ...section, children: filtered };
    })
    .filter(s => !s.children || s.children.length > 0);
};

type SidebarProps = {
  mobileOpen?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

const Sidebar: React.FC<SidebarProps> = ({
  mobileOpen = false,
  onClose,
  collapsed = false,
  onToggleCollapse
}) => {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const { companyName } = useBranding();
  const sidebarRef = useRef<HTMLElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { hasPermission } = usePermissions();

  const toggle = (label: string) => setOpen(prev => ({ ...prev, [label]: !prev[label] }));

  const isPathActive = (path?: string) => path === location.pathname;
  const isChildActive = (child: MenuChild): boolean =>
    isMenuGroup(child)
      ? child.children.some(sub => isPathActive(sub.to))
      : isPathActive(child.to);
  const isItemActive = (item: MenuItem): boolean =>
    item.children ? item.children.some(child => isChildActive(child)) : false;

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
    onClose?.();
  };

  const handleMenuItemClick = () => {
    onClose?.();
  };

  useEffect(() => {
    onClose?.();
  }, [location.pathname, onClose]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.querySelector<HTMLElement>('[aria-controls="primary-navigation"]');
    const sidebar = sidebarRef.current;
    const focusable = () => Array.from(sidebar?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)') || [])
      .filter(element => element.getClientRects().length > 0 && getComputedStyle(element).visibility === 'visible');
    let focusFrame = 0;
    const focusWhenVisible = () => {
      const close = sidebar?.querySelector<HTMLElement>('[aria-label="Close navigation"]');
      if (close && getComputedStyle(close).visibility === 'visible') close.focus();
      else focusFrame = requestAnimationFrame(focusWhenVisible);
    };
    focusFrame = requestAnimationFrame(focusWhenVisible);
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose?.();
      if (event.key !== 'Tab') return;
      const elements = focusable();
      const first = elements[0], last = elements[elements.length - 1];
      if (!sidebar?.contains(document.activeElement)) { event.preventDefault(); first?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keyboard);
    return () => {
      document.removeEventListener('keydown', keyboard);
      cancelAnimationFrame(focusFrame);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [mobileOpen, onClose]);

  const visible = (to: string) => {
    const required = permissionForPath(to);
    return !required || hasPermission(required.component, required.action);
  };
  const menuToRender: MenuItem[] = buildRestaurantMenu().map(item => ({
    ...item,
    children: item.children?.map(child => isMenuGroup(child)
      ? { ...child, children: child.children.filter(leaf => visible(leaf.to)) } : child)
      .filter(child => isMenuGroup(child) ? child.children.length > 0 : visible(child.to))
  })).filter(item => item.children ? item.children.length > 0 : !item.to || visible(item.to));

  return (
    <aside
      ref={sidebarRef}
      id="primary-navigation"
      data-theme="dark"
      aria-label="Primary navigation"
      role={mobileOpen ? 'dialog' : undefined}
      aria-modal={mobileOpen ? true : undefined}
      className={`ss-sidebar min-h-0 self-stretch flex-shrink-0 overflow-y-auto sidebar-scrollbar transition-[transform,width] duration-200 z-40 transform ${mobileOpen ? 'translate-x-0 visible' : '-translate-x-full invisible'} md:translate-x-0 md:visible shadow-primary`}
    >
      <div className={`${collapsed ? 'px-3' : 'px-5'} py-5 border-b border-line`}>
        <div className={`flex items-center ${collapsed ? 'flex-col gap-2' : 'justify-between'}`}>
          <div className="flex items-center space-x-3">
            <CompanyMark />
            {!collapsed && (
              <div className="min-w-0">
                <div className="ss-company-name text-lg font-semibold text-foreground truncate max-w-36" title={companyName}>{companyName}</div>
                <div className="ss-subheading text-xs text-muted">Restaurant POS</div>
              </div>
            )}
          </div>
          <button onClick={onToggleCollapse} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} className="ss-icon-button hidden md:flex">
            <ChevronLeft size={18} aria-hidden="true" className={`transition-transform ${collapsed ? '' : 'rotate-180'}`} />
          </button>
          <button type="button" onClick={onClose} aria-label="Close navigation" className="ss-icon-button md:hidden"><X size={20} /></button>
        </div>
        {/* Business type dropdown removed for restaurant-only build */}
      </div>
      <nav aria-label="Main" className="px-3 py-4">
        {menuToRender.map(item => (
          <div key={item.label}>
            {item.children ? (
              <div>
                <button
                  type="button"
                  title={collapsed ? item.label.trim() : undefined}
                  aria-label={item.label.trim()}
                  aria-expanded={!collapsed && (open[item.label] || isItemActive(item))}
                  onClick={() => { if (collapsed) onToggleCollapse?.(); toggle(item.label); }}
                  className="ss-nav-link w-full flex items-center justify-between px-3 py-2.5"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <MenuIcon label={item.label} />
                    {!collapsed && <span className="font-medium truncate">{item.label.trim()}</span>}
                  </span>
                  {!collapsed && (
                    <ChevronRight size={16} aria-hidden="true" className={`shrink-0 transition-transform ${(open[item.label] || isItemActive(item)) ? 'rotate-90' : ''}`} />
                  )}
                </button>
                {!collapsed && (open[item.label] || isItemActive(item)) && (
                  <div className="ml-3 mt-1 space-y-1">
                    {item.children.map(child => {
                      const groupKey = `${item.label}::${child.label}`;
                      if (isMenuGroup(child)) {
                        return (
                          <div key={child.label}>
                            <button
                              type="button"
                              onClick={() => toggle(groupKey)}
                              aria-expanded={!!open[groupKey]}
                              className="ss-nav-link w-full flex items-center justify-between px-3 py-2 rounded text-sm text-left truncate whitespace-nowrap"
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                <MenuIcon label={child.label} size={16} />
                                <span className="truncate">{child.label}</span>
                              </span>
                              <ChevronRight size={14} aria-hidden="true" className={`shrink-0 transition-transform ${open[groupKey] ? 'rotate-90' : ''}`} />
                            </button>
                            {open[groupKey] && (
                              <div className="ml-3 mt-1 space-y-1 border-l border-line/20 pl-2">
                                {child.children.map(sub => (
                                  <NavLink
                                    key={sub.label}
                                    to={sub.to}
                                    onClick={handleMenuItemClick}
                                    className={({ isActive }) =>
                                      `flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-colors truncate whitespace-nowrap ${isActive ? 'ss-nav-active' : 'ss-nav-link'}`
                                    }
                                  >
                                    <MenuIcon label={sub.label} size={14} />
                                    <span className="truncate">{sub.label}</span>
                                  </NavLink>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      }
                      return (
                        <NavLink
                          key={child.label}
                          to={child.to}
                          onClick={handleMenuItemClick}
                          className={({ isActive }) =>
                            `flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors truncate whitespace-nowrap ${isActive ? 'ss-nav-active' : 'ss-nav-link'}`
                          }
                        >
                          <MenuIcon label={child.label} size={16} />
                          <span className="truncate">{child.label}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              item.label === 'Logout' ? (
                <button
                  onClick={handleLogout}
                  title={collapsed ? item.label : undefined}
                  className="ss-nav-link w-full flex items-center gap-3 px-3 py-2.5 transition-colors"
                >
                  <MenuIcon label={item.label} />
                  {!collapsed && <span>Logout</span>}
                </button>
              ) : (
                <NavLink
                  to={item.to || '#'}
                  onClick={handleMenuItemClick}
                  title={collapsed ? item.label.trim() : undefined}
                  className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded transition-colors ${isActive ? 'ss-nav-active' : 'ss-nav-link'}`}
                >
                  <MenuIcon label={item.label} />
                  {!collapsed && <span className="truncate">{item.label.trim()}</span>}
                </NavLink>
              )
            )}
          </div>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
