import React, { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';

/** Leaf link in the sidebar */
export type MenuLeaf = { label: string; to: string };
/** Item is either a direct link or a nested group (e.g. Categories → kitchen & recipes) */
export type MenuChild = MenuLeaf | { label: string; children: MenuLeaf[] };

type MenuItem = {
  label: string;
  to?: string;
  children?: MenuChild[];
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
  const navigate = useNavigate();
  const location = useLocation();

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

  const menuToRender: MenuItem[] = buildRestaurantMenu();

  return (
    <aside
      className={`${collapsed ? 'md:w-20' : 'md:w-72'} w-72 min-h-screen h-auto self-stretch bg-[#001F54] text-white flex-shrink-0 overflow-y-auto transition-all duration-200 fixed inset-y-0 left-0 z-40 transform ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
    >
      <div className={`${collapsed ? 'px-3' : 'px-5'} py-4 border-b border-white/10`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded bg-white/20 flex items-center justify-center">
              <span className="text-white font-bold">SS</span>
            </div>
            {!collapsed && (
              <div>
                <div className="text-lg font-semibold">ServeSmart</div>
                <div className="text-xs text-white/70">Restaurant POS</div>
              </div>
            )}
          </div>
          <button onClick={onToggleCollapse} className="hidden md:flex w-8 h-8 rounded hover:bg-white/10 items-center justify-center">
            <span className={`transition-transform ${collapsed ? '' : 'rotate-180'}`}>❮</span>
          </button>
        </div>
        {/* Business type dropdown removed for restaurant-only build */}
      </div>
      <nav className="px-2 py-3">
        {menuToRender.map(item => (
          <div key={item.label}>
            {item.children ? (
              <div>
                <button onClick={() => !collapsed && toggle(item.label)} className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-[#002147]">
                  <span className="font-medium truncate">{collapsed ? item.label[0] : item.label}</span>
                  {!collapsed && (
                    <span className={`transition-transform text-[10px] ${(open[item.label] || isItemActive(item)) ? 'rotate-90' : ''}`}>▶</span>
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
                              className="w-full flex items-center justify-between px-3 py-2 rounded text-sm text-left truncate whitespace-nowrap hover:bg-[#002147]"
                            >
                              <span>{child.label}</span>
                              <span className={`transition-transform text-[10px] ${open[groupKey] ? 'rotate-90' : ''}`}>▶</span>
                            </button>
                            {open[groupKey] && (
                              <div className="ml-3 mt-1 space-y-1 border-l border-white/20 pl-2">
                                {child.children.map(sub => (
                                  <NavLink
                                    key={sub.label}
                                    to={sub.to}
                                    onClick={handleMenuItemClick}
                                    className={({ isActive }) =>
                                      `block px-3 py-1.5 rounded text-xs transition-colors truncate whitespace-nowrap ${isActive ? 'bg-[#004080]' : 'hover:bg-[#002147]'}`
                                    }
                                  >
                                    {sub.label}
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
                            `block px-3 py-2 rounded text-sm transition-colors truncate whitespace-nowrap ${isActive ? 'bg-[#004080]' : 'hover:bg-[#002147]'}`
                          }
                        >
                          {child.label}
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              item.label === 'Logout' ? (
                <button onClick={handleLogout} className="w-full text-left px-3 py-2 rounded hover:bg-[#002147] transition-colors">{collapsed ? '⎋' : 'Logout'}</button>
              ) : (
                <NavLink to={item.to || '#'} onClick={handleMenuItemClick} className={({ isActive }) => `block px-3 py-2 rounded transition-colors ${isActive ? 'bg-[#004080]' : 'hover:bg-[#002147]'}`}>
                  {collapsed ? item.label[0] : item.label}
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