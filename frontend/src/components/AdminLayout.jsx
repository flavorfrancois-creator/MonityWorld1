import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../utils/api';
import {
  LayoutDashboard, Users, CreditCard, Globe, Settings, LogOut, ArrowLeft, ShieldCheck, MapPin, Smartphone, Shield, Sliders, UserCheck, ToggleRight, Building2, Percent, Nfc, BarChart3, Coins, Menu, ChevronLeft, ChevronRight, X, Lock, Crown, Activity, FileSpreadsheet, MessageCircle, Wallet, CalendarClock, Plug, Banknote
} from 'lucide-react';
import { Button } from './ui/button';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Badge } from './ui/badge';

// Menu items with required permissions
const ADMIN_NAV = [
  { path: '/admin', icon: LayoutDashboard, label: 'Tableau de bord', exact: true, permission: 'dashboard.view' },
  { path: '/admin/analytics', icon: BarChart3, label: 'Tableau de Contrôle', permission: 'analytics.view' },
  { path: '/admin/kyc', icon: UserCheck, label: 'Vérification KYC', permission: 'kyc.view' },
  { path: '/admin/kyc-dashboard', icon: Percent, label: 'Performances KYC', permission: 'kyc.view' },
  { path: '/admin/users', icon: Users, label: 'Utilisateurs', permission: 'users.view' },
  { path: '/admin/transactions', icon: CreditCard, label: 'Transactions', permission: 'transactions.view' },
  { path: '/admin/accounting', icon: FileSpreadsheet, label: 'Export Comptable', permission: 'transactions.export' },
  { path: '/admin/currencies', icon: Globe, label: 'Devises & Taux', permission: 'currencies.view' },
  { path: '/admin/countries', icon: MapPin, label: 'Pays', permission: 'countries.view' },
  { path: '/admin/country-services', icon: ToggleRight, label: 'Services par Pays', permission: 'services_country.view' },
  { path: '/admin/country-currencies', icon: Coins, label: 'Devises par Pays', permission: 'currencies_country.view' },
  { path: '/admin/partners', icon: Building2, label: 'Partenaires', permission: 'partners.view' },
  { path: '/admin/partner-rates', icon: Percent, label: 'Taux Partenaires', permission: 'partner_rates.view' },
  { path: '/admin/nfc-limits', icon: Nfc, label: 'Limites NFC', permission: 'nfc_limits.view' },
  { path: '/admin/virtual-cards', icon: Smartphone, label: 'Cartes Virtuelles', permission: 'virtual_cards.view' },
  { path: '/admin/transaction-rules', icon: Sliders, label: 'Règles & Frais', permission: 'rules_fees.view' },
  { path: '/admin/administrators', icon: Shield, label: 'Administrateurs', permission: 'admins.view' },
  { path: '/admin/client-deposit', icon: Banknote, label: 'Dépôt Client', permission: 'clients.deposit' },
  { path: '/admin/activity-logs', icon: Activity, label: 'Historique Activité', permission: 'admins.view' },
  { path: '/admin/api-integrations', icon: Plug, label: 'Intégrations API', permission: 'settings.view' },
  { path: '/admin/whatsapp', icon: MessageCircle, label: 'WhatsApp', permission: 'primary_admin_only' },
  { path: '/admin/bank-cards', icon: Wallet, label: 'Cartes Bancaires', permission: 'primary_admin_only' },
  { path: '/admin/nfc-subscriptions', icon: CalendarClock, label: 'Abonnements NFC', permission: 'primary_admin_only' },
  { path: '/admin/settings', icon: Settings, label: 'Paramètres', permission: 'settings.view' },
];

export default function AdminLayout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'A';
  
  // Sidebar state
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [myPermissions, setMyPermissions] = useState(null);

  // Fetch permissions
  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        const res = await API.get('/admin/rbac/my-permissions');
        setMyPermissions(res.data);
      } catch (e) {
        console.error('Error fetching permissions:', e);
      }
    };
    fetchPermissions();
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  // Handle escape key to close mobile menu
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') setIsMobileOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const toggleSidebar = () => setIsCollapsed(!isCollapsed);
  const toggleMobile = () => setIsMobileOpen(!isMobileOpen);

  // Check if user has permission for a menu item
  const hasPermission = (permission) => {
    if (!myPermissions) return true; // Show all while loading
    if (myPermissions.is_original_primary) return true; // Original primary admin sees all
    if (!permission) return true; // No permission required
    // Special permission for primary admin only features
    if (permission === 'primary_admin_only') return myPermissions.is_original_primary;
    return myPermissions.permissions?.includes(permission);
  };

  // Filter menu items based on permissions
  const visibleNavItems = ADMIN_NAV.filter(item => hasPermission(item.permission));

  // Get role display info
  const getRoleDisplay = () => {
    if (myPermissions?.is_original_primary) return { label: 'Admin Principal', color: 'text-yellow-400' };
    if (myPermissions?.is_primary_admin) return { label: 'Admin Principal (2)', color: 'text-purple-400' };
    if (user?.role === 'admin') return { label: 'Administrateur', color: 'text-blue-400' };
    if (user?.role === 'manager') return { label: 'Gestionnaire', color: 'text-green-400' };
    return { label: user?.role || 'Admin', color: 'text-primary' };
  };

  const roleInfo = getRoleDisplay();

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

      {/* Admin User */}
      <div className={`${isCollapsed && !mobile ? 'px-2' : 'px-4'} py-4 border-b border-border`}>
        <div className={`flex items-center ${isCollapsed && !mobile ? 'justify-center p-2' : 'gap-3 p-3'} rounded-xl bg-secondary/50`}>
          <Avatar className="w-9 h-9 flex-shrink-0">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">{initials}</AvatarFallback>
          </Avatar>
          {(!isCollapsed || mobile) && (
            <div className="flex-1 min-w-0 overflow-hidden">
              <p className="text-sm font-semibold text-foreground truncate">{user?.name}</p>
              <p className={`text-xs capitalize ${roleInfo.color}`}>{roleInfo.label}</p>
              {myPermissions?.assigned_countries?.length > 0 && (
                <p className="text-xs text-muted-foreground truncate">
                  {myPermissions.assigned_countries.join(', ')}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className={`flex-1 ${isCollapsed && !mobile ? 'px-2' : 'px-3'} py-4 space-y-1 overflow-y-auto scrollbar-thin`}>
        {visibleNavItems.map(({ path, icon: Icon, label, exact }) => {
          const active = exact ? location.pathname === path : location.pathname === path;
          return (
            <Link 
              key={path} 
              to={path} 
              data-testid={`admin-nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
              title={isCollapsed && !mobile ? label : undefined}
              className={`sidebar-item flex items-center ${isCollapsed && !mobile ? 'justify-center px-2' : 'gap-3 px-3'} py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${active ? 'active' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Icon size={18} className="flex-shrink-0" />
              {(!isCollapsed || mobile) && <span className="whitespace-nowrap overflow-hidden">{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Back + Logout */}
      <div className={`${isCollapsed && !mobile ? 'px-2' : 'px-3'} py-4 border-t border-border space-y-1`}>
        <Link 
          to="/dashboard" 
          title={isCollapsed && !mobile ? 'Retour au portail' : undefined}
          className={`sidebar-item flex items-center ${isCollapsed && !mobile ? 'justify-center px-2' : 'gap-3 px-3'} py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground transition-all duration-200`}
        >
          <ArrowLeft size={18} className="flex-shrink-0" />
          {(!isCollapsed || mobile) && <span className="whitespace-nowrap">Retour au portail</span>}
        </Link>
        <Button 
          variant="ghost" 
          className={`w-full ${isCollapsed && !mobile ? 'justify-center px-2' : 'justify-start gap-3'} text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200`} 
          onClick={logout} 
          data-testid="admin-logout-btn"
          title={isCollapsed && !mobile ? 'Déconnexion' : undefined}
        >
          <LogOut size={18} className="flex-shrink-0" />
          {(!isCollapsed || mobile) && <span className="whitespace-nowrap">Déconnexion</span>}
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm transition-opacity duration-300"
          onClick={toggleMobile}
        />
      )}

      {/* Mobile Sidebar */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-card border-r border-border flex flex-col transform transition-transform duration-300 ease-in-out lg:hidden ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarContent mobile={true} />
      </aside>

      {/* Desktop Sidebar */}
      <aside 
        className={`hidden lg:flex bg-card border-r border-border flex-col flex-shrink-0 transition-all duration-300 ease-in-out relative ${
          isCollapsed ? 'w-16' : 'w-64'
        }`}
      >
        <SidebarContent />
        
        {/* Collapse Toggle Button */}
        <button
          onClick={toggleSidebar}
          className="absolute -right-3 top-20 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-lg hover:bg-primary/90 transition-all duration-200 z-10"
          title={isCollapsed ? 'Agrandir le menu' : 'Réduire le menu'}
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-4 lg:px-6 h-16 bg-card border-b border-border flex-shrink-0">
          {/* Mobile Menu Button */}
          <Button 
            variant="ghost" 
            size="icon" 
            className="lg:hidden"
            onClick={toggleMobile}
          >
            <Menu size={20} />
          </Button>
          
          <h1 className="font-semibold text-foreground" style={{fontFamily:'Manrope'}}>
            {visibleNavItems.find(n => n.path === location.pathname)?.label || 'Admin Panel'}
          </h1>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            <span className="text-xs text-muted-foreground hidden sm:inline">Système actif</span>
          </div>
        </header>
        
        {/* KYC Warning Banner */}
        {myPermissions?.kyc_required && !myPermissions?.kyc_exempt && (
          <div className="bg-orange-500/10 border-b border-orange-500/30 px-4 lg:px-6 py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                <Shield size={16} className="text-orange-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-orange-400">
                  Vérification d'identité requise
                </p>
                <p className="text-xs text-muted-foreground">
                  Certaines fonctionnalités sont limitées. Complétez votre KYC pour un accès complet.
                  <span className="ml-1 text-orange-400/80">
                    Statut actuel: {myPermissions?.kyc_status === 'pending' ? 'En attente' : 
                                   myPermissions?.kyc_status === 'submitted' ? 'Soumis' :
                                   myPermissions?.kyc_status === 'pre_approved' ? 'Pré-approuvé' :
                                   myPermissions?.kyc_status === 'rejected' ? 'Rejeté' : 
                                   myPermissions?.kyc_status}
                  </span>
                </p>
              </div>
              <Button 
                size="sm" 
                variant="outline" 
                className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                onClick={() => window.location.href = '/profile'}
              >
                Compléter KYC
              </Button>
            </div>
          </div>
        )}
        
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
