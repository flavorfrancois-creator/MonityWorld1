import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import API from '../../utils/api';
import { toast } from 'sonner';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { 
  Users, CreditCard, TrendingUp, Clock, CheckCircle2, XCircle, Globe, 
  Phone, Smartphone, Link2, Wallet, Building2, CreditCard as CardIcon,
  PiggyBank, Users2, ArrowRightLeft, ArrowDownToLine, Send, RefreshCw, Lock
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Badge } from '../../components/ui/badge';

const CHART_COLORS = ['#22c55e', '#3b82f6', '#eab308', '#ef4444', '#8b5cf6', '#f97316', '#06b6d4', '#ec4899'];

const COUNTRY_FLAGS = {
  'ALL': '🌍', 'CD': '🇨🇩', 'CM': '🇨🇲', 'SN': '🇸🇳', 'CI': '🇨🇮', 'NG': '🇳🇬',
  'GH': '🇬🇭', 'FR': '🇫🇷', 'BE': '🇧🇪', 'US': '🇺🇸', 'CN': '🇨🇳', 'GB': '🇬🇧',
  'KE': '🇰🇪', 'TZ': '🇹🇿', 'UG': '🇺🇬', 'ZA': '🇿🇦', 'MA': '🇲🇦', 'TN': '🇹🇳'
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-2 shadow-xl text-xs">
      <p className="text-muted-foreground">{label}</p>
      {payload.map((p, i) => <p key={i} style={{ color: p.color }} className="font-semibold">{p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</p>)}
    </div>
  );
};

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [recentTxs, setRecentTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [countries, setCountries] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState('ALL');
  const [txCategories, setTxCategories] = useState(null);
  const [myPermissions, setMyPermissions] = useState(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  // Fetch my permissions to determine country access
  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        const res = await API.get('/admin/rbac/my-permissions');
        setMyPermissions(res.data);
        
        // If admin has restricted country access, set default filter
        if (res.data.assigned_countries?.length > 0) {
          setSelectedCountry(res.data.assigned_countries[0]);
        }
      } catch (e) {
        console.error('Error fetching permissions:', e);
      }
    };
    fetchPermissions();
  }, []);

  // Check if user has access to view all countries
  const canViewAllCountries = myPermissions?.is_original_primary || 
    myPermissions?.permissions?.includes('dashboard.view_all') || 
    !myPermissions?.assigned_countries?.length;
  
  // Get accessible countries
  const accessibleCountries = useMemo(
    () => myPermissions?.assigned_countries || [],
    [myPermissions?.assigned_countries]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const countryParam = selectedCountry !== 'ALL' ? `?country=${selectedCountry}` : '';
      
      // Fetch all data in parallel with error handling
      const [sRes, tRes, cRes] = await Promise.all([
        API.get(`/admin/stats${countryParam}`),
        API.get(`/admin/transactions?status=pending&limit=5${selectedCountry !== 'ALL' ? `&country=${selectedCountry}` : ''}`),
        API.get('/admin/countries')
      ]);
      
      setStats(sRes.data);
      setRecentTxs(tRes.data.transactions || []);
      
      // Filter countries based on user access
      let availableCountries = cRes.data.countries?.filter(c => c.is_active) || [];
      if (accessibleCountries.length > 0) {
        availableCountries = availableCountries.filter(c => accessibleCountries.includes(c.code));
      }
      setCountries(availableCountries);
      
      // Try to fetch categories separately (non-blocking)
      try {
        const catRes = await API.get(`/admin/transaction-categories${countryParam}`);
        setTxCategories(catRes.data);
      } catch {
        // Categories endpoint may not exist, use fallback data
        setTxCategories(null);
      }
    } catch (e) {
      console.error(e);
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [selectedCountry, accessibleCountries]);

  useEffect(() => { 
    if (myPermissions !== null) {
      fetchData(); 
    }
  }, [fetchData, myPermissions]);

  const handleApprove = async (txId) => {
    try {
      await API.patch(`/admin/transactions/${txId}`, { action: 'approve', note: 'Validé par admin' });
      toast.success('Transaction approuvée');
      setRecentTxs(prev => prev.filter(t => t.id !== txId));
    } catch (e) { toast.error(e.response?.data?.detail || 'Erreur'); }
  };

  const handleReject = async (txId) => {
    try {
      await API.patch(`/admin/transactions/${txId}`, { action: 'reject', note: 'Rejeté par admin' });
      toast.success('Transaction rejetée');
      setRecentTxs(prev => prev.filter(t => t.id !== txId));
    } catch (e) { toast.error(e.response?.data?.detail || 'Erreur'); }
  };

  if (loading) return (
    <div className="p-6 space-y-4">{[1,2,3,4].map(i => <div key={i} className="skeleton h-24 w-full rounded-xl" />)}</div>
  );

  const metrics = [
    { label: 'Utilisateurs', value: stats?.total_users || 0, icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Transactions', value: stats?.total_transactions || 0, icon: CreditCard, color: 'text-green-400', bg: 'bg-green-500/10' },
    { label: 'En attente', value: stats?.pending_transactions || 0, icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-500/10', urgent: (stats?.pending_transactions || 0) > 0 },
    { label: 'Volume 30j', value: `$${(stats?.volume_30d || 0).toLocaleString()}`, icon: TrendingUp, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  ];

  // Transaction categories with icons
  const transferCategories = [
    { key: 'phone', label: 'Par téléphone', icon: Phone, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { key: 'card', label: 'Par carte', icon: CardIcon, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { key: 'payment_link', label: 'Lien de paiement', icon: Link2, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
    { key: 'global', label: 'Global', icon: Globe, color: 'text-green-400', bg: 'bg-green-500/10' },
  ];

  const withdrawalCategories = [
    { key: 'mobile_money', label: 'Mobile Money', icon: Smartphone, color: 'text-orange-400', bg: 'bg-orange-500/10' },
    { key: 'bank', label: 'Compte bancaire', icon: Building2, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { key: 'visa', label: 'Carte Visa', icon: CardIcon, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
  ];

  const savingsCategories = [
    { key: 'savings', label: 'Épargne individuelle', icon: PiggyBank, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  ];

  const tontineCategories = [
    { key: 'local', label: 'Tontines locales', icon: Users2, color: 'text-green-400', bg: 'bg-green-500/10' },
    { key: 'international', label: 'Tontines internationales', icon: Globe, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { key: 'global', label: 'Tontines globales', icon: ArrowRightLeft, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Country Filter Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card border border-border rounded-xl p-4">
        <div>
          <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: 'Manrope' }}>
            Tableau de bord
          </h1>
          <p className="text-sm text-muted-foreground">
            {selectedCountry === 'ALL' ? 'Vue globale - Tous les pays' : `Filtré par: ${COUNTRY_FLAGS[selectedCountry] || ''} ${countries.find(c => c.code === selectedCountry)?.name || selectedCountry}`}
          </p>
          {!canViewAllCountries && accessibleCountries.length > 0 && (
            <Badge variant="outline" className="mt-1 text-xs bg-blue-500/10 text-blue-400 border-blue-500/20">
              <Lock size={10} className="mr-1" /> Accès limité: {accessibleCountries.join(', ')}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Globe size={18} className="text-muted-foreground" />
          <Select value={selectedCountry} onValueChange={setSelectedCountry}>
            <SelectTrigger className="w-48" data-testid="country-filter">
              <SelectValue placeholder="Sélectionner un pays" />
            </SelectTrigger>
            <SelectContent>
              {canViewAllCountries && (
                <SelectItem value="ALL">
                  <span className="flex items-center gap-2">🌍 Global (Tous les pays)</span>
                </SelectItem>
              )}
              {countries.map(c => (
                <SelectItem key={c.code} value={c.code}>
                  <span className="flex items-center gap-2">
                    {COUNTRY_FLAGS[c.code] || '🏳️'} {c.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={fetchData}>
            <RefreshCw size={14} />
          </Button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in-up">
        {metrics.map(({ label, value, icon: Icon, color, bg, urgent }) => (
          <div key={label} className={`bg-card border rounded-xl p-5 ${urgent ? 'border-yellow-500/30' : 'border-border'}`} data-testid={`metric-${label.toLowerCase().replace(/\s+/g, '-')}`}>
            <div className="flex items-center justify-between mb-3">
              <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center`}>
                <Icon size={18} className={color} />
              </div>
              {urgent && <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />}
            </div>
            <p className="text-2xl font-bold text-foreground" style={{fontFamily:'Manrope'}}>{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Transaction Categories */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Transferts */}
        <div className="bg-card border border-border rounded-xl p-5 animate-fade-in-up">
          <div className="flex items-center gap-2 mb-4">
            <Send size={18} className="text-primary" />
            <h3 className="font-semibold text-foreground" style={{fontFamily:'Manrope'}}>Transferts</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {transferCategories.map(({ key, label, icon: Icon, color, bg }) => (
              <div key={key} className="bg-secondary/30 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center`}>
                    <Icon size={14} className={color} />
                  </div>
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-lg font-bold text-foreground">
                    {txCategories?.transfers?.[key]?.count || stats?.tx_by_type?.find(t => t.type === 'transfer')?.count || 0}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ${(txCategories?.transfers?.[key]?.volume || 0).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Retraits */}
        <div className="bg-card border border-border rounded-xl p-5 animate-fade-in-up">
          <div className="flex items-center gap-2 mb-4">
            <ArrowDownToLine size={18} className="text-orange-400" />
            <h3 className="font-semibold text-foreground" style={{fontFamily:'Manrope'}}>Retraits</h3>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {withdrawalCategories.map(({ key, label, icon: Icon, color, bg }) => (
              <div key={key} className="bg-secondary/30 rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
                    <Icon size={16} className={color} />
                  </div>
                  <div>
                    <span className="text-sm text-foreground font-medium">{label}</span>
                    <p className="text-xs text-muted-foreground">
                      {txCategories?.withdrawals?.[key]?.count || (key === 'mobile_money' ? stats?.tx_by_type?.find(t => t.type === 'withdrawal')?.count || 0 : 0)} transactions
                    </p>
                  </div>
                </div>
                <span className="text-lg font-bold text-foreground">
                  ${(txCategories?.withdrawals?.[key]?.volume || 0).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Savings & Tontines */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Épargne */}
        <div className="bg-card border border-border rounded-xl p-5 animate-fade-in-up">
          <div className="flex items-center gap-2 mb-4">
            <PiggyBank size={18} className="text-emerald-400" />
            <h3 className="font-semibold text-foreground" style={{fontFamily:'Manrope'}}>Épargne</h3>
          </div>
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total épargné</p>
                <p className="text-2xl font-bold text-emerald-400">
                  ${(txCategories?.savings?.total_amount || stats?.total_savings || 0).toLocaleString()}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Comptes actifs</p>
                <p className="text-xl font-bold text-foreground">
                  {txCategories?.savings?.active_accounts || 0}
                </p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-emerald-500/20 grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Dépôts ce mois</p>
                <p className="text-lg font-semibold text-foreground">
                  {txCategories?.savings?.deposits_this_month || 0}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Retraits ce mois</p>
                <p className="text-lg font-semibold text-foreground">
                  {txCategories?.savings?.withdrawals_this_month || 0}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tontines */}
        <div className="bg-card border border-border rounded-xl p-5 animate-fade-in-up">
          <div className="flex items-center gap-2 mb-4">
            <Users2 size={18} className="text-blue-400" />
            <h3 className="font-semibold text-foreground" style={{fontFamily:'Manrope'}}>Tontines (Cotisations)</h3>
          </div>
          <div className="space-y-3">
            {tontineCategories.map(({ key, label, icon: Icon, color, bg }) => (
              <div key={key} className="bg-secondary/30 rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
                    <Icon size={16} className={color} />
                  </div>
                  <div>
                    <span className="text-sm text-foreground font-medium">{label}</span>
                    <p className="text-xs text-muted-foreground">
                      {txCategories?.tontines?.[key]?.groups || 0} groupes · {txCategories?.tontines?.[key]?.members || 0} membres
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold text-foreground">
                    ${(txCategories?.tontines?.[key]?.volume || 0).toLocaleString()}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {txCategories?.tontines?.[key]?.contributions || 0} cotisations
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Transactions Chart */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5 animate-fade-in-up">
          <h3 className="font-semibold text-foreground mb-4" style={{fontFamily:'Manrope'}}>
            Transactions (7 derniers jours)
            {selectedCountry !== 'ALL' && <span className="text-xs text-muted-foreground ml-2">- {COUNTRY_FLAGS[selectedCountry]} {selectedCountry}</span>}
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={stats?.daily_chart || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} />
              <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="count" stroke="#22c55e" strokeWidth={2} dot={{ fill: '#22c55e', r: 4 }} name="Transactions" />
              <Line type="monotone" dataKey="volume" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 4 }} name="Volume ($)" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* TX By Type */}
        <div className="bg-card border border-border rounded-xl p-5 animate-fade-in-up">
          <h3 className="font-semibold text-foreground mb-4" style={{fontFamily:'Manrope'}}>Par type</h3>
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie data={stats?.tx_by_type || []} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={60} innerRadius={35}>
                {(stats?.tx_by_type || []).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 space-y-1">
            {(stats?.tx_by_type || []).map((t, i) => (
              <div key={t.type} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{background: CHART_COLORS[i % CHART_COLORS.length]}} />
                  <span className="text-muted-foreground capitalize">{t.type}</span>
                </div>
                <span className="text-foreground font-medium">{t.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Users by Country (only show in global view) */}
      {selectedCountry === 'ALL' && stats?.users_by_country?.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5 animate-fade-in-up">
          <h3 className="font-semibold text-foreground mb-4" style={{fontFamily:'Manrope'}}>Utilisateurs par pays</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={stats.users_by_country}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="country" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} />
              <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" fill="#22c55e" radius={[4,4,0,0]} name="Utilisateurs" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Pending Transactions */}
      {recentTxs.length > 0 && (
        <div className="bg-card border border-yellow-500/20 rounded-xl p-5 animate-fade-in-up">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2" style={{fontFamily:'Manrope'}}>
              <Clock size={16} className="text-yellow-400" />
              Transactions en attente ({recentTxs.length})
              {selectedCountry !== 'ALL' && <span className="text-xs text-muted-foreground">- {COUNTRY_FLAGS[selectedCountry]}</span>}
            </h3>
            <Button size="sm" variant="outline" onClick={() => navigate(`/admin/transactions?status=pending${selectedCountry !== 'ALL' ? `&country=${selectedCountry}` : ''}`)}>
              Voir tout
            </Button>
          </div>
          <div className="space-y-2">
            {recentTxs.map(tx => (
              <div key={tx.id} className="flex items-center gap-3 p-3 bg-secondary/20 rounded-lg" data-testid={`pending-tx-${tx.id}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{tx.sender_name || 'Système'} → {tx.receiver_name}</p>
                    {tx.is_international && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">International</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {tx.amount} {tx.currency} · {tx.type} · {new Date(tx.created_at).toLocaleDateString('fr-FR')}
                    {tx.sender_country && tx.receiver_country && tx.sender_country !== tx.receiver_country && (
                      <span className="ml-1">{COUNTRY_FLAGS[tx.sender_country]} → {COUNTRY_FLAGS[tx.receiver_country]}</span>
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 px-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20" onClick={() => handleApprove(tx.id)} data-testid={`approve-tx-${tx.id}`}>
                    <CheckCircle2 size={13} />
                  </Button>
                  <Button size="sm" className="h-7 px-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20" onClick={() => handleReject(tx.id)} data-testid={`reject-tx-${tx.id}`}>
                    <XCircle size={13} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
