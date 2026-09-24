import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import Layout from './components/Layout';
import AdminLayout from './components/AdminLayout';
import PartnerLayout from './components/PartnerLayout';
import HelpButton from './components/HelpButton';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import SendMoney from './pages/SendMoney';
import TransactionHistory from './pages/TransactionHistory';
import WalletPage from './pages/WalletPage';
import SavingsPage from './pages/SavingsPage';
import CotisationPage from './pages/CotisationPage';
import ReferralPage from './pages/ReferralPage';
import ProfilePage from './pages/ProfilePage';
import QRPayment from './pages/QRPayment';
import VirtualCards from './pages/VirtualCards';
import BankCardsPage from './pages/BankCardsPage';
import PaymentLinks from './pages/PaymentLinks';
import EcommerceLinks from './pages/EcommerceLinks';
import EcommercePayPage from './pages/EcommercePayPage';
import PayLink from './pages/PayLink';
import ManagedAccounts from './pages/ManagedAccounts';
import SecurityPage from './pages/SecurityPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminKYC from './pages/admin/AdminKYC';
import AdminUsers from './pages/admin/AdminUsers';
import AdminTransactions from './pages/admin/AdminTransactions';
import AdminCurrencies from './pages/admin/AdminCurrencies';
import AdminCountries from './pages/admin/AdminCountries';
import AdminCountryServices from './pages/admin/AdminCountryServices';
import AdminPartners from './pages/admin/AdminPartners';
import AdminPartnerRates from './pages/admin/AdminPartnerRates';
import AdminNFCCardLimits from './pages/admin/AdminNFCCardLimits';
import AdminVirtualCards from './pages/admin/AdminVirtualCards';
import AdminAdministrators from './pages/admin/AdminAdministrators';
import AdminSettings from './pages/admin/AdminSettings';
import AdminTransactionRules from './pages/admin/AdminTransactionRules';
import AdminCountryCurrencies from './pages/admin/AdminCountryCurrencies';
import AdminAnalytics from './pages/admin/AdminAnalytics';
import AdminActivityLogs from './pages/admin/AdminActivityLogs';
import AdminAccountingExport from './pages/admin/AdminAccountingExport';
import AdminKYCDashboard from './pages/admin/AdminKYCDashboard';
import AdminWhatsapp from './pages/admin/AdminWhatsapp';
import AdminBankCards from './pages/admin/AdminBankCards';
import AdminNFCSubscriptions from './pages/admin/AdminNFCSubscriptions';
import AdminApiIntegrations from './pages/admin/AdminApiIntegrations';
import AdminLoginPage from './pages/admin/AdminLoginPage';
import AdminClientDeposit from './pages/admin/AdminClientDeposit';
import PartnerLogin from './pages/partner/PartnerLogin';
import PartnerDashboard from './pages/partner/PartnerDashboard';
import PartnerRecharge from './pages/partner/PartnerRecharge';
import PartnerWithdraw from './pages/partner/PartnerWithdraw';
import PartnerNFC from './pages/partner/PartnerNFC';
import PartnerTransactions from './pages/partner/PartnerTransactions';
import './App.css';

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground text-sm">Chargement...</p>
      </div>
    </div>
  );
  return isAuthenticated ? children : <Navigate to="/" replace />;
}

function AdminRoute({ children }) {
  const { isAuthenticated, loading, user } = useAuth();
  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!isAuthenticated) return <Navigate to="/admin/login" replace />;
  if (!['admin', 'manager', 'primary_admin', 'secondary_primary_admin'].includes(user?.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

function AppRoutes() {
  const { isAuthenticated, user } = useAuth();
  const getRedirect = () => {
    if (['admin', 'manager', 'primary_admin', 'secondary_primary_admin'].includes(user?.role)) return '/admin';
    return '/dashboard';
  };
  return (
    <Routes>
      <Route path="/" element={isAuthenticated ? <Navigate to={getRedirect()} replace /> : <AuthPage />} />
      <Route path="/admin/login" element={isAuthenticated && ['admin', 'manager', 'primary_admin', 'secondary_primary_admin'].includes(user?.role) ? <Navigate to="/admin" replace /> : <AdminLoginPage />} />
      <Route path="/dashboard" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
      <Route path="/send" element={<ProtectedRoute><Layout><SendMoney /></Layout></ProtectedRoute>} />
      <Route path="/history" element={<ProtectedRoute><Layout><TransactionHistory /></Layout></ProtectedRoute>} />
      <Route path="/wallet" element={<ProtectedRoute><Layout><WalletPage /></Layout></ProtectedRoute>} />
      <Route path="/savings" element={<ProtectedRoute><Layout><SavingsPage /></Layout></ProtectedRoute>} />
      <Route path="/cotisation" element={<ProtectedRoute><Layout><CotisationPage /></Layout></ProtectedRoute>} />
      <Route path="/referral" element={<ProtectedRoute><Layout><ReferralPage /></Layout></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Layout><ProfilePage /></Layout></ProtectedRoute>} />
      <Route path="/qr" element={<ProtectedRoute><Layout><QRPayment /></Layout></ProtectedRoute>} />
      <Route path="/virtual-cards" element={<ProtectedRoute><Layout><VirtualCards /></Layout></ProtectedRoute>} />
      <Route path="/bank-cards" element={<ProtectedRoute><Layout><BankCardsPage /></Layout></ProtectedRoute>} />
      <Route path="/payment-links" element={<ProtectedRoute><Layout><PaymentLinks /></Layout></ProtectedRoute>} />
      <Route path="/ecommerce-links" element={<ProtectedRoute><Layout><EcommerceLinks /></Layout></ProtectedRoute>} />
      <Route path="/managed-accounts" element={<ProtectedRoute><Layout><ManagedAccounts /></Layout></ProtectedRoute>} />
      <Route path="/security" element={<ProtectedRoute><Layout><SecurityPage /></Layout></ProtectedRoute>} />
      <Route path="/pay/:linkCode" element={<PayLink />} />
      <Route path="/ecommerce/:linkCode" element={<EcommercePayPage />} />
      {/* Admin Routes */}
      <Route path="/admin" element={<AdminRoute><AdminLayout><AdminDashboard /></AdminLayout></AdminRoute>} />
      <Route path="/admin/kyc" element={<AdminRoute><AdminLayout><AdminKYC /></AdminLayout></AdminRoute>} />
      <Route path="/admin/kyc-dashboard" element={<AdminRoute><AdminLayout><AdminKYCDashboard /></AdminLayout></AdminRoute>} />
      <Route path="/admin/users" element={<AdminRoute><AdminLayout><AdminUsers /></AdminLayout></AdminRoute>} />
      <Route path="/admin/transactions" element={<AdminRoute><AdminLayout><AdminTransactions /></AdminLayout></AdminRoute>} />
      <Route path="/admin/currencies" element={<AdminRoute><AdminLayout><AdminCurrencies /></AdminLayout></AdminRoute>} />
      <Route path="/admin/countries" element={<AdminRoute><AdminLayout><AdminCountries /></AdminLayout></AdminRoute>} />
      <Route path="/admin/country-services" element={<AdminRoute><AdminLayout><AdminCountryServices /></AdminLayout></AdminRoute>} />
      <Route path="/admin/country-currencies" element={<AdminRoute><AdminLayout><AdminCountryCurrencies /></AdminLayout></AdminRoute>} />
      <Route path="/admin/partners" element={<AdminRoute><AdminLayout><AdminPartners /></AdminLayout></AdminRoute>} />
      <Route path="/admin/partner-rates" element={<AdminRoute><AdminLayout><AdminPartnerRates /></AdminLayout></AdminRoute>} />
      <Route path="/admin/nfc-limits" element={<AdminRoute><AdminLayout><AdminNFCCardLimits /></AdminLayout></AdminRoute>} />
      <Route path="/admin/virtual-cards" element={<AdminRoute><AdminLayout><AdminVirtualCards /></AdminLayout></AdminRoute>} />
      <Route path="/admin/analytics" element={<AdminRoute><AdminLayout><AdminAnalytics /></AdminLayout></AdminRoute>} />
      <Route path="/admin/administrators" element={<AdminRoute><AdminLayout><AdminAdministrators /></AdminLayout></AdminRoute>} />
      <Route path="/admin/client-deposit" element={<AdminRoute><AdminLayout><AdminClientDeposit /></AdminLayout></AdminRoute>} />
      <Route path="/admin/transaction-rules" element={<AdminRoute><AdminLayout><AdminTransactionRules /></AdminLayout></AdminRoute>} />
      <Route path="/admin/activity-logs" element={<AdminRoute><AdminLayout><AdminActivityLogs /></AdminLayout></AdminRoute>} />
      <Route path="/admin/accounting" element={<AdminRoute><AdminLayout><AdminAccountingExport /></AdminLayout></AdminRoute>} />
      <Route path="/admin/whatsapp" element={<AdminRoute><AdminLayout><AdminWhatsapp /></AdminLayout></AdminRoute>} />
      <Route path="/admin/bank-cards" element={<AdminRoute><AdminLayout><AdminBankCards /></AdminLayout></AdminRoute>} />
      <Route path="/admin/nfc-subscriptions" element={<AdminRoute><AdminLayout><AdminNFCSubscriptions /></AdminLayout></AdminRoute>} />
      <Route path="/admin/api-integrations" element={<AdminRoute><AdminLayout><AdminApiIntegrations /></AdminLayout></AdminRoute>} />
      <Route path="/admin/settings" element={<AdminRoute><AdminLayout><AdminSettings /></AdminLayout></AdminRoute>} />
      {/* Partner Routes */}
      <Route path="/partner/login" element={<PartnerLogin />} />
      <Route path="/partner" element={<PartnerLayout><PartnerDashboard /></PartnerLayout>} />
      <Route path="/partner/recharge" element={<PartnerLayout><PartnerRecharge /></PartnerLayout>} />
      <Route path="/partner/withdraw" element={<PartnerLayout><PartnerWithdraw /></PartnerLayout>} />
      <Route path="/partner/nfc" element={<PartnerLayout><PartnerNFC /></PartnerLayout>} />
      <Route path="/partner/transactions" element={<PartnerLayout><PartnerTransactions /></PartnerLayout>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <LanguageProvider>
            <AppRoutes />
            <HelpButton />
            <Toaster richColors position="top-right" theme="dark" />
          </LanguageProvider>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}
