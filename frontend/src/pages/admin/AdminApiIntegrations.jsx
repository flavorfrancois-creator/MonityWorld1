import { useState, useEffect, useCallback } from 'react';
import API from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { 
  Plug, Plus, Settings, Trash2, Check, X, RefreshCw, 
  Building2, Smartphone, Bitcoin, Wallet, Globe, 
  CheckCircle, XCircle, Clock, Play, Pause, Eye, 
  TestTube, ChevronDown, ChevronRight, BarChart3,
  Copy, AlertTriangle, Search, Filter
} from 'lucide-react';

const CATEGORY_ICONS = {
  banking: Building2,
  mobile_money: Smartphone,
  crypto: Bitcoin,
  ewallet: Wallet,
  other: Globe
};

const CATEGORY_COLORS = {
  banking: 'blue',
  mobile_money: 'orange',
  crypto: 'yellow',
  ewallet: 'purple',
  other: 'gray'
};

const CATEGORY_NAMES = {
  banking: 'APIs Bancaires',
  mobile_money: 'Mobile Money',
  crypto: 'Crypto-monnaies',
  ewallet: 'Portefeuilles Électroniques',
  other: 'Autres Systèmes'
};

export default function AdminApiIntegrations() {
  const [integrations, setIntegrations] = useState([]);
  const [integrationTypes, setIntegrationTypes] = useState({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showDetails, setShowDetails] = useState(null);
  const [showTest, setShowTest] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState(['banking', 'mobile_money', 'crypto', 'ewallet']);
  const [filterCategory, setFilterCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Form states
  const [formData, setFormData] = useState({
    integration_type: '',
    integration_code: '',
    display_name: '',
    category: 'banking',
    api_base_url: '',
    api_key: '',
    api_secret: '',
    api_token: '',
    merchant_id: '',
    account_id: '',
    deposit_endpoint: '/deposit',
    withdrawal_endpoint: '/withdraw',
    balance_endpoint: '/balance',
    status_endpoint: '/status',
    webhook_url: '',
    webhook_secret: '',
    supports_deposit: true,
    supports_withdrawal: true,
    supports_balance_check: false,
    supported_countries: [],
    supported_currencies: ['USD'],
    default_currency: 'USD',
    deposit_fee_type: 'percentage',
    deposit_fee_percentage: 1.5,
    deposit_fee_fixed: 0,
    withdrawal_fee_type: 'percentage',
    withdrawal_fee_percentage: 2.0,
    withdrawal_fee_fixed: 0,
    min_deposit: 1,
    max_deposit: 10000,
    min_withdrawal: 1,
    max_withdrawal: 5000,
    daily_limit: null,
    monthly_limit: null,
    is_active: true,
    is_test_mode: true,
    priority: 1
  });

  const fetchData = useCallback(async () => {
    try {
      const [integrationsRes, typesRes] = await Promise.all([
        API.get('/admin/integrations'),
        API.get('/admin/integrations/types')
      ]);
      setIntegrations(integrationsRes.data.integrations || []);
      setIntegrationTypes(typesRes.data.types || {});
    } catch (e) {
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const resetForm = () => {
    setFormData({
      integration_type: '',
      integration_code: '',
      display_name: '',
      category: 'banking',
      api_base_url: '',
      api_key: '',
      api_secret: '',
      api_token: '',
      merchant_id: '',
      account_id: '',
      deposit_endpoint: '/deposit',
      withdrawal_endpoint: '/withdraw',
      balance_endpoint: '/balance',
      status_endpoint: '/status',
      webhook_url: '',
      webhook_secret: '',
      supports_deposit: true,
      supports_withdrawal: true,
      supports_balance_check: false,
      supported_countries: [],
      supported_currencies: ['USD'],
      default_currency: 'USD',
      deposit_fee_type: 'percentage',
      deposit_fee_percentage: 1.5,
      deposit_fee_fixed: 0,
      withdrawal_fee_type: 'percentage',
      withdrawal_fee_percentage: 2.0,
      withdrawal_fee_fixed: 0,
      min_deposit: 1,
      max_deposit: 10000,
      min_withdrawal: 1,
      max_withdrawal: 5000,
      daily_limit: null,
      monthly_limit: null,
      is_active: true,
      is_test_mode: true,
      priority: 1
    });
  };

  const handleTypeSelect = (typeCode, typeInfo) => {
    setFormData(prev => ({
      ...prev,
      integration_type: typeCode,
      display_name: typeInfo.name,
      category: typeInfo.category,
      integration_code: typeCode.toUpperCase() + '_' + Date.now().toString().slice(-4)
    }));
  };

  const createIntegration = async () => {
    if (!formData.integration_code || !formData.api_base_url) {
      toast.error('Code et URL de base requis');
      return;
    }

    try {
      await API.post('/admin/integrations', formData);
      toast.success('Intégration créée avec succès');
      setShowCreate(false);
      resetForm();
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur lors de la création');
    }
  };

  const toggleIntegration = async (code) => {
    try {
      const res = await API.post(`/admin/integrations/${code}/toggle`);
      toast.success(res.data.message);
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const deleteIntegration = async (code) => {
    if (!window.confirm('Supprimer cette intégration ?')) return;
    try {
      await API.delete(`/admin/integrations/${code}`);
      toast.success('Intégration supprimée');
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const testIntegration = async (code) => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await API.post(`/admin/integrations/${code}/test`, {
        integration_code: code,
        test_type: 'connection'
      });
      setTestResult(res.data);
      if (res.data.success) {
        toast.success('Connexion réussie');
      } else {
        toast.error(res.data.message);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur de test');
    } finally {
      setTesting(false);
    }
  };

  const viewDetails = async (code) => {
    try {
      const res = await API.get(`/admin/integrations/${code}`);
      setShowDetails(res.data);
    } catch (e) {
      toast.error('Erreur de chargement des détails');
    }
  };

  const toggleCategory = (category) => {
    setExpandedCategories(prev => 
      prev.includes(category) 
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  // Group integrations by category
  const groupedIntegrations = integrations.reduce((acc, int) => {
    const cat = int.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(int);
    return acc;
  }, {});

  // Filter integrations
  const filteredCategories = Object.keys(groupedIntegrations).filter(cat => 
    filterCategory === 'all' || filterCategory === cat
  );

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="skeleton h-32 w-full rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Manrope' }}>
            Intégrations API
          </h1>
          <p className="text-sm text-muted-foreground">
            Gérez les connexions avec les systèmes bancaires, Mobile Money, crypto et autres
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} data-testid="create-integration-btn">
          <Plus size={16} className="mr-2" />
          Nouvelle intégration
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Object.entries(CATEGORY_NAMES).map(([cat, name]) => {
          const Icon = CATEGORY_ICONS[cat];
          const color = CATEGORY_COLORS[cat];
          const count = groupedIntegrations[cat]?.length || 0;
          const activeCount = groupedIntegrations[cat]?.filter(i => i.is_active).length || 0;
          
          return (
            <div 
              key={cat}
              className={`bg-card border border-border rounded-xl p-4 cursor-pointer hover:border-${color}-500/50 transition-colors ${filterCategory === cat ? `border-${color}-500/50 bg-${color}-500/5` : ''}`}
              onClick={() => setFilterCategory(filterCategory === cat ? 'all' : cat)}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-lg bg-${color}-500/10 flex items-center justify-center`}>
                  <Icon size={16} className={`text-${color}-400`} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground truncate">{name}</p>
              <p className="text-xl font-bold text-foreground">{count}</p>
              <p className="text-xs text-green-400">{activeCount} actives</p>
            </div>
          );
        })}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher une intégration..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        {filterCategory !== 'all' && (
          <Button variant="outline" size="sm" onClick={() => setFilterCategory('all')}>
            <X size={14} className="mr-1" />
            Effacer filtre
          </Button>
        )}
      </div>

      {/* Integrations by Category */}
      <div className="space-y-4">
        {filteredCategories.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-12 text-center">
            <Plug size={48} className="mx-auto text-muted-foreground mb-3 opacity-50" />
            <h3 className="font-semibold text-foreground">Aucune intégration configurée</h3>
            <p className="text-sm text-muted-foreground mt-1">Ajoutez des intégrations pour connecter votre application aux services financiers</p>
            <Button className="mt-4" onClick={() => setShowCreate(true)}>
              <Plus size={16} className="mr-2" />
              Créer une intégration
            </Button>
          </div>
        ) : (
          filteredCategories.map(category => {
            const Icon = CATEGORY_ICONS[category];
            const color = CATEGORY_COLORS[category];
            const categoryIntegrations = groupedIntegrations[category].filter(int =>
              searchQuery === '' || 
              int.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
              int.integration_code?.toLowerCase().includes(searchQuery.toLowerCase())
            );

            if (categoryIntegrations.length === 0) return null;

            return (
              <div key={category} className="bg-card border border-border rounded-xl overflow-hidden">
                {/* Category Header */}
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg bg-${color}-500/10 flex items-center justify-center`}>
                      <Icon size={20} className={`text-${color}-400`} />
                    </div>
                    <div className="text-left">
                      <h3 className="font-semibold text-foreground">{CATEGORY_NAMES[category]}</h3>
                      <p className="text-xs text-muted-foreground">
                        {categoryIntegrations.length} intégration(s) • {categoryIntegrations.filter(i => i.is_active).length} active(s)
                      </p>
                    </div>
                  </div>
                  {expandedCategories.includes(category) ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                </button>

                {/* Category Integrations */}
                {expandedCategories.includes(category) && (
                  <div className="border-t border-border divide-y divide-border">
                    {categoryIntegrations.map(integration => (
                      <div 
                        key={integration.id}
                        className="p-4 hover:bg-secondary/30 transition-colors"
                        data-testid={`integration-${integration.integration_code}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-semibold text-foreground">{integration.display_name}</h4>
                              {integration.is_active ? (
                                <span className="badge-completed flex items-center gap-1">
                                  <CheckCircle size={10} />Actif
                                </span>
                              ) : (
                                <span className="badge-rejected flex items-center gap-1">
                                  <XCircle size={10} />Inactif
                                </span>
                              )}
                              {integration.is_test_mode && (
                                <span className="px-2 py-0.5 rounded text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                                  Mode Test
                                </span>
                              )}
                              {integration.last_test_status === 'success' && (
                                <span className="px-2 py-0.5 rounded text-xs bg-green-500/10 text-green-400 border border-green-500/20">
                                  Connecté
                                </span>
                              )}
                              {integration.last_test_status === 'failed' && (
                                <span className="px-2 py-0.5 rounded text-xs bg-red-500/10 text-red-400 border border-red-500/20">
                                  Erreur connexion
                                </span>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                              <code className="bg-secondary px-2 py-0.5 rounded">{integration.integration_code}</code>
                              <span className="truncate max-w-[200px]">{integration.api_base_url}</span>
                            </div>

                            <div className="flex items-center gap-4 mt-2 text-xs">
                              <span className="text-muted-foreground">
                                <BarChart3 size={12} className="inline mr-1" />
                                {integration.stats?.total_transactions || 0} transactions
                              </span>
                              <span className="text-muted-foreground">
                                Volume: ${(integration.stats?.total_volume || 0).toLocaleString()}
                              </span>
                              {integration.supports_deposit && (
                                <span className="text-green-400">Dépôt: {integration.deposit_fee_percentage}%</span>
                              )}
                              {integration.supports_withdrawal && (
                                <span className="text-blue-400">Retrait: {integration.withdrawal_fee_percentage}%</span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => { setShowTest(integration); testIntegration(integration.integration_code); }}
                              title="Tester la connexion"
                            >
                              <TestTube size={14} />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => viewDetails(integration.integration_code)}
                            >
                              <Eye size={14} />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => toggleIntegration(integration.integration_code)}
                            >
                              {integration.is_active ? <Pause size={14} /> : <Play size={14} />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteIntegration(integration.integration_code)}
                              className="text-muted-foreground hover:text-red-400"
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Create Integration Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto animate-fade-in-up">
            <div className="sticky top-0 bg-card border-b border-border p-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Plug size={20} className="text-primary" />
                Nouvelle intégration API
              </h3>
              <Button variant="ghost" size="sm" onClick={() => { setShowCreate(false); resetForm(); }}>
                <X size={16} />
              </Button>
            </div>

            <div className="p-6 space-y-6">
              {/* Step 1: Select Type */}
              {!formData.integration_type && (
                <div>
                  <h4 className="font-semibold text-foreground mb-4">1. Sélectionnez le type d'intégration</h4>
                  <div className="space-y-4">
                    {Object.entries(integrationTypes).map(([category, catData]) => (
                      <div key={category} className="bg-secondary/30 rounded-xl p-4">
                        <h5 className="font-medium text-foreground mb-3 flex items-center gap-2">
                          {(() => { const Icon = CATEGORY_ICONS[category]; return Icon ? <Icon size={16} /> : null; })()}
                          {catData.name}
                        </h5>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {catData.integrations?.map(type => (
                            <button
                              key={type.code}
                              onClick={() => handleTypeSelect(type.code, type)}
                              className="p-3 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors text-left"
                            >
                              <p className="font-medium text-foreground text-sm">{type.name}</p>
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{type.description}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}

                    {/* Custom option */}
                    <button
                      onClick={() => handleTypeSelect('custom', { name: 'API Personnalisée', category: 'other' })}
                      className="w-full p-4 rounded-xl border border-dashed border-border hover:border-primary/50 transition-colors text-center"
                    >
                      <Plus size={20} className="mx-auto mb-2 text-muted-foreground" />
                      <p className="font-medium text-foreground">API Personnalisée</p>
                      <p className="text-xs text-muted-foreground">Configurez une intégration sur mesure</p>
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Configure */}
              {formData.integration_type && (
                <>
                  <div className="flex items-center gap-3 p-3 bg-primary/10 rounded-lg">
                    <CheckCircle size={20} className="text-primary" />
                    <div>
                      <p className="font-medium text-foreground">{formData.display_name}</p>
                      <p className="text-xs text-muted-foreground">{CATEGORY_NAMES[formData.category]}</p>
                    </div>
                    <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setFormData(prev => ({ ...prev, integration_type: '' }))}>
                      Changer
                    </Button>
                  </div>

                  {/* Basic Info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-muted-foreground">Code unique *</label>
                      <Input
                        value={formData.integration_code}
                        onChange={(e) => setFormData(prev => ({ ...prev, integration_code: e.target.value.toUpperCase() }))}
                        placeholder="STRIPE_PROD"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">Nom d'affichage</label>
                      <Input
                        value={formData.display_name}
                        onChange={(e) => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
                        placeholder="Stripe Production"
                        className="mt-1"
                      />
                    </div>
                  </div>

                  {/* API Configuration */}
                  <div className="bg-secondary/30 rounded-xl p-4 space-y-4">
                    <h4 className="font-semibold text-foreground">Configuration API</h4>
                    
                    <div>
                      <label className="text-sm text-muted-foreground">URL de base *</label>
                      <Input
                        value={formData.api_base_url}
                        onChange={(e) => setFormData(prev => ({ ...prev, api_base_url: e.target.value }))}
                        placeholder="https://api.stripe.com/v1"
                        className="mt-1"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm text-muted-foreground">Clé API</label>
                        <Input
                          type="password"
                          value={formData.api_key}
                          onChange={(e) => setFormData(prev => ({ ...prev, api_key: e.target.value }))}
                          placeholder="sk_live_..."
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">Secret API</label>
                        <Input
                          type="password"
                          value={formData.api_secret}
                          onChange={(e) => setFormData(prev => ({ ...prev, api_secret: e.target.value }))}
                          placeholder="whsec_..."
                          className="mt-1"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <label className="text-sm text-muted-foreground">Endpoint Dépôt</label>
                        <Input
                          value={formData.deposit_endpoint}
                          onChange={(e) => setFormData(prev => ({ ...prev, deposit_endpoint: e.target.value }))}
                          placeholder="/deposit"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">Endpoint Retrait</label>
                        <Input
                          value={formData.withdrawal_endpoint}
                          onChange={(e) => setFormData(prev => ({ ...prev, withdrawal_endpoint: e.target.value }))}
                          placeholder="/withdraw"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">Endpoint Solde</label>
                        <Input
                          value={formData.balance_endpoint}
                          onChange={(e) => setFormData(prev => ({ ...prev, balance_endpoint: e.target.value }))}
                          placeholder="/balance"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">Endpoint Statut</label>
                        <Input
                          value={formData.status_endpoint}
                          onChange={(e) => setFormData(prev => ({ ...prev, status_endpoint: e.target.value }))}
                          placeholder="/status"
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Fees & Limits */}
                  <div className="bg-secondary/30 rounded-xl p-4 space-y-4">
                    <h4 className="font-semibold text-foreground">Frais & Limites</h4>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <label className="text-sm text-muted-foreground">Frais dépôt (%)</label>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.deposit_fee_percentage}
                          onChange={(e) => setFormData(prev => ({ ...prev, deposit_fee_percentage: parseFloat(e.target.value) || 0 }))}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">Frais retrait (%)</label>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.withdrawal_fee_percentage}
                          onChange={(e) => setFormData(prev => ({ ...prev, withdrawal_fee_percentage: parseFloat(e.target.value) || 0 }))}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">Min dépôt</label>
                        <Input
                          type="number"
                          value={formData.min_deposit}
                          onChange={(e) => setFormData(prev => ({ ...prev, min_deposit: parseFloat(e.target.value) || 0 }))}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">Max dépôt</label>
                        <Input
                          type="number"
                          value={formData.max_deposit}
                          onChange={(e) => setFormData(prev => ({ ...prev, max_deposit: parseFloat(e.target.value) || 0 }))}
                          className="mt-1"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <label className="text-sm text-muted-foreground">Min retrait</label>
                        <Input
                          type="number"
                          value={formData.min_withdrawal}
                          onChange={(e) => setFormData(prev => ({ ...prev, min_withdrawal: parseFloat(e.target.value) || 0 }))}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">Max retrait</label>
                        <Input
                          type="number"
                          value={formData.max_withdrawal}
                          onChange={(e) => setFormData(prev => ({ ...prev, max_withdrawal: parseFloat(e.target.value) || 0 }))}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">Limite/jour</label>
                        <Input
                          type="number"
                          value={formData.daily_limit || ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, daily_limit: e.target.value ? parseFloat(e.target.value) : null }))}
                          placeholder="Illimité"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">Limite/mois</label>
                        <Input
                          type="number"
                          value={formData.monthly_limit || ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, monthly_limit: e.target.value ? parseFloat(e.target.value) : null }))}
                          placeholder="Illimité"
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Options */}
                  <div className="bg-secondary/30 rounded-xl p-4 space-y-4">
                    <h4 className="font-semibold text-foreground">Options</h4>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.supports_deposit}
                          onChange={(e) => setFormData(prev => ({ ...prev, supports_deposit: e.target.checked }))}
                          className="accent-primary"
                        />
                        <span className="text-sm text-foreground">Dépôts</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.supports_withdrawal}
                          onChange={(e) => setFormData(prev => ({ ...prev, supports_withdrawal: e.target.checked }))}
                          className="accent-primary"
                        />
                        <span className="text-sm text-foreground">Retraits</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.is_active}
                          onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                          className="accent-primary"
                        />
                        <span className="text-sm text-foreground">Activer</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.is_test_mode}
                          onChange={(e) => setFormData(prev => ({ ...prev, is_test_mode: e.target.checked }))}
                          className="accent-primary"
                        />
                        <span className="text-sm text-foreground">Mode Test</span>
                      </label>
                    </div>
                  </div>
                </>
              )}
            </div>

            {formData.integration_type && (
              <div className="sticky bottom-0 bg-card border-t border-border p-4 flex gap-3">
                <Button variant="ghost" className="flex-1" onClick={() => { setShowCreate(false); resetForm(); }}>
                  Annuler
                </Button>
                <Button className="flex-1" onClick={createIntegration}>
                  Créer l'intégration
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Test Result Modal */}
      {showTest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md animate-fade-in-up">
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <TestTube size={20} className="text-primary" />
              Test de connexion - {showTest.display_name}
            </h3>

            {testing ? (
              <div className="text-center py-8">
                <RefreshCw size={32} className="animate-spin mx-auto text-primary mb-3" />
                <p className="text-muted-foreground">Test en cours...</p>
              </div>
            ) : testResult ? (
              <div className="space-y-4">
                <div className={`p-4 rounded-lg ${testResult.success ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                  <div className="flex items-center gap-2">
                    {testResult.success ? (
                      <CheckCircle size={20} className="text-green-400" />
                    ) : (
                      <XCircle size={20} className="text-red-400" />
                    )}
                    <span className={`font-medium ${testResult.success ? 'text-green-400' : 'text-red-400'}`}>
                      {testResult.success ? 'Connexion réussie' : 'Échec de connexion'}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">{testResult.message}</p>
                </div>

                <div className="bg-secondary/50 rounded-lg p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Temps de réponse</span>
                    <span className="text-foreground">{testResult.response_time_ms}ms</span>
                  </div>
                  {testResult.details?.status_code && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Code HTTP</span>
                      <span className="text-foreground">{testResult.details.status_code}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            <div className="flex gap-3 mt-6">
              <Button variant="ghost" className="flex-1" onClick={() => { setShowTest(null); setTestResult(null); }}>
                Fermer
              </Button>
              <Button className="flex-1" onClick={() => testIntegration(showTest.integration_code)} disabled={testing}>
                <RefreshCw size={14} className="mr-2" />
                Retester
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {showDetails && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-in-up">
            <div className="sticky top-0 bg-card border-b border-border p-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">{showDetails.display_name}</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowDetails(null)}>
                <X size={16} />
              </Button>
            </div>

            <div className="p-6 space-y-6">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-secondary/50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-foreground">{showDetails.stats?.total_transactions || 0}</p>
                  <p className="text-xs text-muted-foreground">Transactions</p>
                </div>
                <div className="bg-secondary/50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-400">{showDetails.stats?.successful || 0}</p>
                  <p className="text-xs text-muted-foreground">Réussies</p>
                </div>
                <div className="bg-secondary/50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-red-400">{showDetails.stats?.failed || 0}</p>
                  <p className="text-xs text-muted-foreground">Échouées</p>
                </div>
              </div>

              {/* Details Grid */}
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-sm text-muted-foreground">Code</span>
                  <code className="text-sm bg-secondary px-2 py-0.5 rounded">{showDetails.integration_code}</code>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-sm text-muted-foreground">Catégorie</span>
                  <span className="text-sm text-foreground">{CATEGORY_NAMES[showDetails.category]}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-sm text-muted-foreground">URL de base</span>
                  <span className="text-sm text-foreground truncate max-w-[250px]">{showDetails.api_base_url}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-sm text-muted-foreground">Frais dépôt</span>
                  <span className="text-sm text-foreground">{showDetails.deposit_fee_percentage}%</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-sm text-muted-foreground">Frais retrait</span>
                  <span className="text-sm text-foreground">{showDetails.withdrawal_fee_percentage}%</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-sm text-muted-foreground">Limites dépôt</span>
                  <span className="text-sm text-foreground">${showDetails.min_deposit} - ${showDetails.max_deposit}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-sm text-muted-foreground">Limites retrait</span>
                  <span className="text-sm text-foreground">${showDetails.min_withdrawal} - ${showDetails.max_withdrawal}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-sm text-muted-foreground">Dernier test</span>
                  <span className={`text-sm ${showDetails.last_test_status === 'success' ? 'text-green-400' : showDetails.last_test_status === 'failed' ? 'text-red-400' : 'text-muted-foreground'}`}>
                    {showDetails.last_test_at ? new Date(showDetails.last_test_at).toLocaleString('fr-FR') : 'Jamais testé'}
                  </span>
                </div>
              </div>

              {/* Recent Transactions */}
              {showDetails.recent_transactions?.length > 0 && (
                <div>
                  <h4 className="font-semibold text-foreground mb-3">Transactions récentes</h4>
                  <div className="space-y-2">
                    {showDetails.recent_transactions.map(tx => (
                      <div key={tx.id} className="bg-secondary/50 rounded-lg p-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm text-foreground">{tx.transaction_type === 'deposit' ? 'Dépôt' : 'Retrait'}</p>
                          <p className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString('fr-FR')}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-foreground">${tx.amount}</p>
                          <span className={`text-xs ${tx.status === 'completed' ? 'text-green-400' : tx.status === 'failed' ? 'text-red-400' : 'text-yellow-400'}`}>
                            {tx.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
