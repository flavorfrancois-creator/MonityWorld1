import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import API from '../utils/api';
import {
  LayoutDashboard, Send, History, Wallet, PiggyBank, Users2, Gift, User,
  LogOut, Bell, ChevronRight, ChevronLeft, Settings, ShieldCheck, Menu, X, QrCode, 
  CreditCard, Link2, UserCog, ShoppingCart, Smartphone
} from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Avatar, AvatarFallback } from './ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from './ui/dropdown-menu';

const NAV_ITEMS = [
  { path: '/dashboard', icon: LayoutDashboard, key: 'dashboard' },
  { path: '/send', icon: Send, key: 'send' },
  { path: '/qr', icon: QrCode, key: 'qr_payment', label: 'QR Code' },
  { path: '/history', icon: History, key: 'history' },
  { path: '/wallet', icon: Wallet, key: 'wallet' },
  { path: '/virtual-cards', icon: CreditCard, key: 'virtual_cards', label: 'Cartes Virtuelles' },
  { path: '/bank-cards', icon: Smartphone, key: 'bank_cards', label: 'Cartes & Mobile' },
  { path: '/payment-links', icon: Link2, key: 'payment_links', label: 'Liens Paiement' },
  { path: '/ecommerce-links', icon: ShoppingCart, key: 'ecommerce_links', label: 'Liens E-commerce' },
  { path: '/savings', icon: PiggyBank, key: 'savings' },
  { path: '/cotisation', icon: Users2, key: 'cotisation' },
  { path: '/managed-accounts', icon: UserCog, key: 'managed', label: 'Gestion Comptes' },
  { path: '/security', icon: ShieldCheck, key: 'security', label: 'Sécurité' },
  { path: '/referral', icon: Gift, key: 'referral' },
  { path: '/profile', icon: User, key: 'profile' },
];

const MOBILE_NAV = [
  { path: '/dashboard', icon: LayoutDashboard, key: 'dashboard' },
  { path: '/send', icon: Send, key: 'send' },
  { path: '/qr', icon: QrCode, key: 'qr' },
  { path: '/wallet', icon: Wallet, key: 'wallet' },
  { path: '/profile', icon: User, key: 'profile' },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';

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

  // Fetch notifications
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const res = await API.get('/notifications');
        setNotifications(res.data.notifications || []);
        setUnreadCount(res.data.unread_count || 0);
      } catch (err) {
        console.error('Error fetching notifications:', err);
      }
    };
    
    fetchNotifications();
    // Poll every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const markAsRead = async (notifId) => {
    try {
      await API.patch(`/notifications/${notifId}/read`);
      setNotifications(prev => prev.map(n => n.id === notifId ? {...n, is_read: true} : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
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
            <X size={18} />
          </Button>
        )}
      </div>

      {/* User Info */}
      <div className={`${isCollapsed && !mobile ? 'px-2' : 'px-4'} py-4 border-b border-border`}>
        <div className={`flex items-center ${isCollapsed && !mobile ? 'justify-center p-2' : 'gap-3 p-3'} rounded-xl bg-secondary/50`}>
          <Avatar className="w-9 h-9 flex-shrink-0">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">{initials}</AvatarFallback>
          </Avatar>
          {(!isCollapsed || mobile) && (
            <div className="flex-1 min-w-0 overflow-hidden">
              <p className="text-sm font-semibold text-foreground truncate">{user?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.phone}</p>
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className={`flex-1 ${isCollapsed && !mobile ? 'px-2' : 'px-3'} py-4 space-y-1 overflow-y-auto scrollbar-thin`}>
        {NAV_ITEMS.map(({ path, icon: Icon, key, label }) => {
          const active = location.pathname === path;
          return (
            <Link
              key={path}
              to={path}
              data-testid={`nav-${key}`}
              title={isCollapsed && !mobile ? (label || t(key)) : undefined}
              onClick={mobile ? toggleMobile : undefined}
              className={`sidebar-item flex items-center ${isCollapsed && !mobile ? 'justify-center px-2' : 'gap-3 px-3'} py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${active ? 'active' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Icon size={18} className="flex-shrink-0" />
              {(!isCollapsed || mobile) && (
                <>
                  <span className="whitespace-nowrap overflow-hidden">{label || t(key)}</span>
                  {active && <ChevronRight size={14} className="ml-auto text-primary flex-shrink-0" />}
                </>
              )}
            </Link>
          );
        })}

        {['admin', 'manager'].includes(user?.role) && (
          <Link
            to="/admin"
            data-testid="nav-admin"
            title={isCollapsed && !mobile ? t('admin') : undefined}
            onClick={mobile ? toggleMobile : undefined}
            className={`sidebar-item flex items-center ${isCollapsed && !mobile ? 'justify-center px-2' : 'gap-3 px-3'} py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${location.pathname.startsWith('/admin') ? 'active' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <ShieldCheck size={18} className="flex-shrink-0" />
            {(!isCollapsed || mobile) && <span className="whitespace-nowrap">{t('admin')}</span>}
          </Link>
        )}
      </nav>

      {/* Logout */}
      <div className={`${isCollapsed && !mobile ? 'px-2' : 'px-3'} py-4 border-t border-border`}>
        <Button
          variant="ghost"
          className={`w-full ${isCollapsed && !mobile ? 'justify-center px-2' : 'justify-start gap-3'} text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200`}
          onClick={logout}
          data-testid="logout-btn"
          title={isCollapsed && !mobile ? t('logout') : undefined}
        >
          <LogOut size={18} className="flex-shrink-0" />
          {(!isCollapsed || mobile) && <span className="whitespace-nowrap">{t('logout')}</span>}
        </Button>
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
          className="absolute -right-3 top-20 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-lg hover:bg-primary/90 transition-all duration-200 z-10"
          title={isCollapsed ? 'Agrandir le menu' : 'Réduire le menu'}
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="flex items-center justify-between px-4 lg:px-6 h-16 bg-card border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={toggleMobile} data-testid="mobile-menu-btn">
              <Menu size={20} />
            </Button>
            <div className="lg:hidden flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-xs">M</span>
              </div>
              <span className="font-bold text-sm" style={{fontFamily:'Manrope'}}>Monity World</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Notifications Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative" data-testid="notifications-btn">
                  <Bell size={18} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
                <div className="px-3 py-2 font-semibold border-b">Notifications</div>
                {notifications.length === 0 ? (
                  <div className="px-3 py-4 text-center text-muted-foreground text-sm">
                    Aucune notification
                  </div>
                ) : (
                  notifications.slice(0, 10).map(notif => (
                    <DropdownMenuItem 
                      key={notif.id} 
                      className={`flex flex-col items-start p-3 cursor-pointer ${!notif.is_read ? 'bg-primary/5' : ''}`}
                      onClick={() => markAsRead(notif.id)}
                    >
                      <span className="font-medium text-sm">{notif.title}</span>
                      <span className="text-xs text-muted-foreground line-clamp-2">{notif.message}</span>
                      <span className="text-xs text-muted-foreground mt-1">
                        {new Date(notif.created_at).toLocaleDateString('fr-FR')}
                      </span>
                    </DropdownMenuItem>
                  ))
                )}
                {notifications.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="justify-center text-primary" onClick={() => navigate('/profile')}>
                      Voir tout
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Avatar className="w-8 h-8 cursor-pointer" onClick={() => navigate('/profile')}>
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">{initials}</AvatarFallback>
            </Avatar>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto pb-20 lg:pb-0">
          {children}
        </main>

        {/* Mobile Bottom Nav */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border z-40">
          <div className="flex items-center justify-around px-2 py-2">
            {MOBILE_NAV.map(({ path, icon: Icon, key }) => {
              const active = location.pathname === path;
              return (
                <Link key={path} to={path} data-testid={`mobile-nav-${key}`}
                  className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg transition-colors ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                  <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                  <span className="text-xs font-medium">{t(key)}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
