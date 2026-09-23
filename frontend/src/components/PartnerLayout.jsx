import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, Users, CreditCard, Wallet, History, LogOut, ArrowLeft,
  Building2, UserPlus, UserMinus, Menu, ChevronLeft, ChevronRight, X
} from 'lucide-react';
import { Button } from './ui/button';

const PARTNER_NAV = [
  { path: '/partner', icon: LayoutDashboard, label: 'Tableau de bord', exact: true },
  { path: '/partner/recharge', icon: UserPlus, label: 'Recharger Client' },
  { path: '/partner/withdraw', icon: UserMinus, label: 'Retrait Client' },
  { path: '/partner/nfc', icon: CreditCard, label: 'Cartes NFC' },
  { path: '/partner/transactions', icon: History, label: 'Historique' },
];

export default function PartnerLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [partner, setPartner] = useState(null);
  
  // Sidebar state
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const loadPartner = useCallback(() => {
    const storedPartner = localStorage.getItem('partner');
    if (storedPartner) {
      setPartner(JSON.parse(storedPartner));
    }
  }, []);

  useEffect(() => {
    loadPartner();
    
    // Listen for custom partner update event
    const handlePartnerUpdate = () => loadPartner();
    window.addEventListener('partnerUpdate', handlePartnerUpdate);
    
    // Also listen for storage changes (for cross-tab support)
    window.addEventListener('storage', (e) => {
      if (e.key === 'partner') loadPartner();
    });
    
    return () => {
      window.removeEventListener('partnerUpdate', handlePartnerUpdate);
    };
  }, [loadPartner]);

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

  const handleLogout = () => {
    localStorage.removeItem('monity_token');
    localStorage.removeItem('partner');
    logout();
    navigate('/partner/login');
  };

  const toggleSidebar = () => setIsCollapsed(!isCollapsed);
  const toggleMobile = () => setIsMobileOpen(!isMobileOpen);

  const SidebarContent = ({ mobile = false }) => (
    <>
      {/* Logo */}
      <div className={`${isCollapsed && !mobile ? 'px-2 justify-center' : 'px-4'} py-4 border-b border-border flex items-center gap-2`}>
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

      {/* Partner Info */}
      {partner && (
        <div className={`${isCollapsed && !mobile ? 'px-2' : 'px-4'} py-4 border-b border-border`}>
          <div className={`flex items-center ${isCollapsed && !mobile ? 'justify-center' : 'gap-3'}`}>
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Building2 size={18} className="text-primary" />
            </div>
            {(!isCollapsed || mobile) && (
              <div className="flex-1 min-w-0 overflow-hidden">
                <p className="text-sm font-medium text-foreground truncate">{partner.business_name}</p>
                <p className="text-xs text-muted-foreground truncate">{partner.phone}</p>
              </div>
            )}
          </div>
          <div className={`mt-3 bg-secondary/30 rounded-lg ${isCollapsed && !mobile ? 'p-1' : 'p-2'} text-center`}>
            {(!isCollapsed || mobile) && <p className="text-xs text-muted-foreground">Solde</p>}
            <p className={`font-bold text-primary ${isCollapsed && !mobile ? 'text-sm' : 'text-lg'}`}>
              {isCollapsed && !mobile ? '$' : ''}{partner.balance?.toFixed(isCollapsed && !mobile ? 0 : 2) || '0.00'}
              {(!isCollapsed || mobile) && <span className="text-xs">$</span>}
            </p>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className={`flex-1 ${isCollapsed && !mobile ? 'px-2' : 'px-3'} py-4 space-y-1 overflow-y-auto`}>
        {PARTNER_NAV.map(item => {
          const isActive = item.exact 
            ? location.pathname === item.path 
            : location.pathname.startsWith(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              title={isCollapsed && !mobile ? item.label : undefined}
              className={`flex items-center ${isCollapsed && !mobile ? 'justify-center px-2' : 'gap-3 px-3'} py-2.5 rounded-lg text-sm transition-all duration-200 ${
                isActive 
                  ? 'bg-primary/10 text-primary font-medium' 
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <item.icon size={16} className="flex-shrink-0" />
              {(!isCollapsed || mobile) && <span className="whitespace-nowrap">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className={`${isCollapsed && !mobile ? 'px-2' : 'px-3'} py-4 border-t border-border space-y-1`}>
        <button
          onClick={handleLogout}
          title={isCollapsed && !mobile ? 'Déconnexion' : undefined}
          className={`flex items-center ${isCollapsed && !mobile ? 'justify-center px-2' : 'gap-3 px-3'} py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-secondary hover:text-foreground w-full transition-all duration-200`}
        >
          <LogOut size={16} className="flex-shrink-0" />
          {(!isCollapsed || mobile) && <span className="whitespace-nowrap">Déconnexion</span>}
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm transition-opacity duration-300"
          onClick={toggleMobile}
        />
      )}

      {/* Mobile Sidebar */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border flex flex-col transform transition-transform duration-300 ease-in-out lg:hidden ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarContent mobile={true} />
      </aside>

      {/* Desktop Sidebar */}
      <aside 
        className={`hidden lg:flex bg-card border-r border-border flex-col fixed h-full transition-all duration-300 ease-in-out relative ${
          isCollapsed ? 'w-16' : 'w-56'
        }`}
      >
        <SidebarContent />
        
        {/* Collapse Toggle Button */}
        <button
          onClick={toggleSidebar}
          className="absolute -right-3 top-16 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-lg hover:bg-primary/90 transition-all duration-200 z-10"
          title={isCollapsed ? 'Agrandir le menu' : 'Réduire le menu'}
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </aside>

      {/* Main Content */}
      <div className={`flex-1 transition-all duration-300 ${isCollapsed ? 'lg:ml-16' : 'lg:ml-56'}`}>
        {/* Top Header */}
        <header className="h-14 bg-card border-b border-border flex items-center justify-between px-4 lg:px-6 sticky top-0 z-10">
          {/* Mobile Menu Button */}
          <Button 
            variant="ghost" 
            size="icon" 
            className="lg:hidden"
            onClick={toggleMobile}
          >
            <Menu size={20} />
          </Button>
          
          <div className="flex items-center gap-2 text-sm text-muted-foreground ml-auto">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            <span className="hidden sm:inline">Système actif</span>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-0">
          {children}
        </main>
      </div>
    </div>
  );
}
