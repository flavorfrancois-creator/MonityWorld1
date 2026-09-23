import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, Package, FileText, CreditCard, Users, Settings,
  LogOut, Bell, Menu, X, Store, Receipt, BarChart3, ChevronRight, ChevronLeft
} from 'lucide-react';
import { Button } from './ui/button';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Badge } from './ui/badge';

const NAV_ITEMS = [
  { path: '/merchant', icon: LayoutDashboard, label: 'Tableau de bord', exact: true },
  { path: '/merchant/pos', icon: CreditCard, label: 'Point de Vente' },
  { path: '/merchant/products', icon: Package, label: 'Produits' },
  { path: '/merchant/invoices', icon: FileText, label: 'Factures' },
  { path: '/merchant/transactions', icon: Receipt, label: 'Transactions' },
  { path: '/merchant/clients', icon: Users, label: 'Clients' },
  { path: '/merchant/analytics', icon: BarChart3, label: 'Statistiques' },
  { path: '/merchant/settings', icon: Settings, label: 'Paramètres' },
];

export default function MerchantLayout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'M';

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Handle escape key to close mobile menu
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const toggleSidebar = () => setIsCollapsed(!isCollapsed);
  const toggleMobile = () => setMobileOpen(!mobileOpen);

  const SidebarContent = ({ mobile = false }) => (
    <>
      {/* Logo */}
      <div className={`flex items-center ${isCollapsed && !mobile ? 'justify-center px-2' : 'gap-3 px-4'} py-4 border-b border-border`}>
        <img 
          src="/logo-monity.png" 
          alt="Monity World" 
          className={`${isCollapsed && !mobile ? 'h-10 w-10' : 'h-14'} object-contain`}
        />
        {mobile && (
          <Button variant="ghost" size="icon" className="ml-auto" onClick={toggleMobile}>
            <X size={20} />
          </Button>
        )}
      </div>

      {/* User Info */}
      <div className={`${isCollapsed && !mobile ? 'px-2' : 'px-4'} py-4 border-b border-border`}>
        <div className={`flex items-center ${isCollapsed && !mobile ? 'justify-center p-2' : 'gap-3 p-3'} rounded-xl bg-secondary/50`}>
          <Avatar className="w-9 h-9 flex-shrink-0">
            <AvatarFallback className="bg-emerald-500 text-white text-xs font-bold">{initials}</AvatarFallback>
          </Avatar>
          {(!isCollapsed || mobile) && (
            <div className="flex-1 min-w-0 overflow-hidden">
              <p className="text-sm font-semibold text-foreground truncate">{user?.name}</p>
              <Badge variant="outline" className="text-xs text-emerald-500 border-emerald-500/30">Marchand</Badge>
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className={`flex-1 ${isCollapsed && !mobile ? 'px-2' : 'px-3'} py-4 space-y-1 overflow-y-auto`}>
        {NAV_ITEMS.map(({ path, icon: Icon, label, exact }) => {
          const active = exact ? location.pathname === path : location.pathname.startsWith(path);
          return (
            <Link
              key={path}
              to={path}
              data-testid={`nav-merchant-${path.split('/').pop() || 'dashboard'}`}
              title={isCollapsed && !mobile ? label : undefined}
              onClick={mobile ? toggleMobile : undefined}
              className={`flex items-center ${isCollapsed && !mobile ? 'justify-center px-2' : 'gap-3 px-3'} py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                active 
                  ? 'bg-emerald-500/10 text-emerald-500' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
            >
              <Icon size={18} className="flex-shrink-0" />
              {(!isCollapsed || mobile) && (
                <>
                  <span className="whitespace-nowrap">{label}</span>
                  {active && <ChevronRight size={14} className="ml-auto text-emerald-500" />}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className={`${isCollapsed && !mobile ? 'px-2' : 'px-4'} py-4 border-t border-border space-y-2`}>
        <Link
          to="/dashboard"
          title={isCollapsed && !mobile ? 'Espace Personnel' : undefined}
          className={`flex items-center ${isCollapsed && !mobile ? 'justify-center px-2' : 'gap-3 px-3'} py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all duration-200`}
        >
          <LayoutDashboard size={18} className="flex-shrink-0" />
          {(!isCollapsed || mobile) && <span className="whitespace-nowrap">Espace Personnel</span>}
        </Link>
        <button
          onClick={handleLogout}
          title={isCollapsed && !mobile ? 'Déconnexion' : undefined}
          className={`w-full flex items-center ${isCollapsed && !mobile ? 'justify-center px-2' : 'gap-3 px-3'} py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-all duration-200`}
        >
          <LogOut size={18} className="flex-shrink-0" />
          {(!isCollapsed || mobile) && <span className="whitespace-nowrap">Déconnexion</span>}
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm transition-opacity duration-300"
          onClick={toggleMobile}
        />
      )}

      {/* Mobile Sidebar */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-card border-r border-border flex flex-col transform transition-transform duration-300 ease-in-out lg:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarContent mobile={true} />
      </aside>

      {/* Sidebar Desktop */}
      <aside 
        className={`hidden lg:flex flex-col bg-card border-r border-border flex-shrink-0 relative transition-all duration-300 ease-in-out ${
          isCollapsed ? 'w-16' : 'w-64'
        }`}
      >
        <SidebarContent />
        
        {/* Collapse Toggle Button */}
        <button
          onClick={toggleSidebar}
          className="absolute -right-3 top-20 w-6 h-6 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-emerald-600 transition-all duration-200 z-10"
          title={isCollapsed ? 'Agrandir le menu' : 'Réduire le menu'}
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-card border-b border-border flex items-center justify-between px-4 z-30">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={toggleMobile}>
            <Menu size={20} />
          </Button>
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
            <Store className="text-white" size={16} />
          </div>
          <span className="font-bold text-sm">Monity Marchand</span>
        </div>
        <Button variant="ghost" size="icon" className="relative">
          <Bell size={20} />
        </Button>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pt-14 lg:pt-0">
        <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-card border-t border-border flex items-center justify-around z-30">
        {[
          { path: '/merchant', icon: LayoutDashboard, label: 'Accueil', exact: true },
          { path: '/merchant/pos', icon: CreditCard, label: 'POS' },
          { path: '/merchant/invoices', icon: FileText, label: 'Factures' },
          { path: '/merchant/products', icon: Package, label: 'Produits' },
          { path: '/merchant/settings', icon: Settings, label: 'Plus' },
        ].map(({ path, icon: Icon, label, exact }) => {
          const active = exact ? location.pathname === path : location.pathname.startsWith(path);
          return (
            <Link
              key={path}
              to={path}
              className={`flex flex-col items-center gap-1 p-2 ${active ? 'text-emerald-500' : 'text-muted-foreground'}`}
            >
              <Icon size={20} />
              <span className="text-xs">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
