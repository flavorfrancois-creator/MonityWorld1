import { useState, useEffect, useCallback } from 'react';
import API from '../utils/api';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { 
  Link2, Plus, Copy, Trash2, Check, ExternalLink, Clock, 
  CheckCircle, XCircle, ArrowDownLeft, ArrowUpRight,
  RefreshCw, BarChart3, Pause, Play, Eye, Key, Shield,
  Settings, Globe, AlertTriangle, EyeOff
} from 'lucide-react';

const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', XAF: 'FCFA', XOF: 'FCFA', GBP: '£', CNY: '¥', CDF: 'FC', NGN: '₦', GHS: '₵', RUB: '₽', CAD: 'C$', MXN: '$' };

export default function EcommerceLinks() {
  const [activeTab, setActiveTab] = useState('links');
  const [links, setLinks] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateApiKey, setShowCreateApiKey] = useState(false);
  const [showTransactions, setShowTransactions] = useState(null);
  const [showApiKeyDetails, setShowApiKeyDetails] = useState(null);
  const [showNewKeySecret, setShowNewKeySecret] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [copiedId, setCopiedId] = useState(null);
  
  // Form states for links
  const [linkType, setLinkType] = useState('receive');
  const [isPermanent, setIsPermanent] = useState(false);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [description, setDescription] = useState('');

  // Form states for API keys
  const [apiKeyName, setApiKeyName] = useState('');
  const [apiKeyWebsite, setApiKeyWebsite] = useState('');
  const [apiKeyWebhook, setApiKeyWebhook] = useState('');
  const [apiKeyIps, setApiKeyIps] = useState('');
  const [apiKeyDailyLimit, setApiKeyDailyLimit] = useState('');
  const [apiKeyPermissions, setApiKeyPermissions] = useState(['payments.receive', 'payments.status']);

  const fetchData = useCallback(async () => {
    try {
      const [linksRes, walletsRes, apiKeysRes] = await Promise.all([
        API.get('/ecommerce-links'),
        API.get('/wallet/wallets'),
        API.get('/api-keys')
      ]);
      setLinks(linksRes.data.links || []);
      setWallets(walletsRes.data || []);
      setApiKeys(apiKeysRes.data.api_keys || []);
    } catch (e) {
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const createLink = async () => {
    if (!description.trim()) {
      toast.error('Description requise');
      return;
    }
    
    if (!isPermanent && (!amount || parseFloat(amount) <= 0)) {
      toast.error('Montant requis pour les liens temporaires');
      return;
    }
    
    try {
      const res = await API.post('/ecommerce-links', {
        link_type: linkType,
        is_permanent: isPermanent,
        fixed_amount: isPermanent ? null : parseFloat(amount),
        currency,
        description: description.trim()
      });
      toast.success('Lien e-commerce créé !');
      setShowCreate(false);
      resetForm();
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const resetForm = () => {
    setLinkType('receive');
    setIsPermanent(false);
    setAmount('');
    setDescription('');
  };

  const resetApiKeyForm = () => {
    setApiKeyName('');
    setApiKeyWebsite('');
    setApiKeyWebhook('');
    setApiKeyIps('');
    setApiKeyDailyLimit('');
    setApiKeyPermissions(['payments.receive', 'payments.status']);
  };

  // API Key functions
  const createApiKey = async () => {
    if (!apiKeyName.trim()) {
      toast.error('Nom de la clé requis');
      return;
    }
    
    try {
      const res = await API.post('/api-keys', {
        name: apiKeyName.trim(),
        website_url: apiKeyWebsite.trim() || null,
        webhook_url: apiKeyWebhook.trim() || null,
        allowed_ips: apiKeyIps ? apiKeyIps.split(',').map(ip => ip.trim()).filter(ip => ip) : [],
        daily_limit: apiKeyDailyLimit ? parseFloat(apiKeyDailyLimit) : null,
        permissions: apiKeyPermissions
      });
      
      toast.success('Clé API créée avec succès !');
      setShowCreateApiKey(false);
      resetApiKeyForm();
      
      // Show the secret to the user
      setShowNewKeySecret(res.data.api_key);
      
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur lors de la création');
    }
  };

  const deleteApiKey = async (keyId) => {
    if (!window.confirm('Supprimer cette clé API ? Cette action est irréversible.')) return;
    try {
      await API.delete(`/api-keys/${keyId}`);
      toast.success('Clé API supprimée');
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const toggleApiKeyStatus = async (key) => {
    try {
      await API.patch(`/api-keys/${key.id}`, {
        is_active: !key.is_active
      });
      toast.success(key.is_active ? 'Clé désactivée' : 'Clé activée');
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const regenerateApiSecret = async (keyId) => {
    if (!window.confirm('Régénérer la clé secrète ? L\'ancienne clé ne fonctionnera plus.')) return;
    try {
      const res = await API.post(`/api-keys/${keyId}/regenerate-secret`);
      setShowNewKeySecret({
        ...res.data,
        id: keyId,
        regenerated: true
      });
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text);
    setCopiedId(type);
    toast.success('Copié !');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const viewApiKeyDetails = async (key) => {
    try {
      const [detailsRes, statsRes] = await Promise.all([
        API.get(`/api-keys/${key.id}`),
        API.get(`/api-keys/${key.id}/stats`)
      ]);
      setShowApiKeyDetails({
        ...detailsRes.data,
        stats: statsRes.data
      });
    } catch (e) {
      toast.error('Erreur de chargement des détails');
    }
  };

  const AVAILABLE_PERMISSIONS = [
    { value: 'payments.receive', label: 'Recevoir des paiements', description: 'Initier des demandes de paiement' },
    { value: 'payments.send', label: 'Envoyer des paiements', description: 'Effectuer des envois automatiques' },
    { value: 'payments.status', label: 'Vérifier le statut', description: 'Consulter l\'état des transactions' },
    { value: 'balance.read', label: 'Lire le solde', description: 'Accès au solde du compte' },
    { value: 'webhooks.manage', label: 'Gérer les webhooks', description: 'Configurer les notifications' }
  ];

  const copyLink = (link) => {
    const fullUrl = `${window.location.origin}/ecommerce/${link.link_code}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedId(link.id);
    toast.success('Lien copié !');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const deleteLink = async (linkId) => {
    if (!window.confirm('Supprimer ce lien e-commerce ?')) return;
    try {
      await API.delete(`/ecommerce-links/${linkId}`);
      toast.success('Lien supprimé');
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const toggleLinkStatus = async (link) => {
    try {
      if (link.status === 'active') {
        await API.patch(`/ecommerce-links/${link.id}/deactivate`);
        toast.success('Lien désactivé');
      } else {
        await API.patch(`/ecommerce-links/${link.id}/reactivate`);
        toast.success('Lien réactivé');
      }
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const viewTransactions = async (link) => {
    try {
      const res = await API.get(`/ecommerce-links/${link.id}/transactions`);
      setTransactions(res.data.transactions || []);
      setShowTransactions(link);
    } catch (e) {
      toast.error('Erreur de chargement des transactions');
    }
  };

  const getStatusBadge = (link) => {
    if (link.status === 'deactivated') {
      return <span className="badge-rejected flex items-center gap-1"><XCircle size={12} />Désactivé</span>;
    }
    if (link.expires_at) {
      const isExpired = new Date(link.expires_at) < new Date();
      if (isExpired) {
        return <span className="badge-rejected flex items-center gap-1"><Clock size={12} />Expiré</span>;
      }
    }
    return <span className="badge-completed flex items-center gap-1"><CheckCircle size={12} />Actif</span>;
  };

  const getLinkTypeBadge = (link) => {
    if (link.link_type === 'receive') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
          <ArrowDownLeft size={10} />Recevoir
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
        <ArrowUpRight size={10} />Envoyer
      </span>
    );
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="skeleton h-28 w-full rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Manrope' }}>Liens E-commerce</h1>
          <p className="text-sm text-muted-foreground">Créez des liens et clés API pour intégrer les paiements sur vos sites</p>
        </div>
        <Button 
          onClick={() => activeTab === 'links' ? setShowCreate(true) : setShowCreateApiKey(true)} 
          data-testid="create-ecommerce-btn"
        >
          <Plus size={16} className="mr-2" />
          {activeTab === 'links' ? 'Nouveau lien' : 'Nouvelle clé API'}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-2">
        <button
          onClick={() => setActiveTab('links')}
          className={`px-4 py-2 rounded-t-lg font-medium transition-all flex items-center gap-2 ${
            activeTab === 'links'
              ? 'bg-primary/10 text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
          }`}
          data-testid="tab-links"
        >
          <Link2 size={16} />
          Liens de paiement
          <span className="text-xs bg-secondary px-2 py-0.5 rounded-full">{links.length}</span>
        </button>
        <button
          onClick={() => setActiveTab('apikeys')}
          className={`px-4 py-2 rounded-t-lg font-medium transition-all flex items-center gap-2 ${
            activeTab === 'apikeys'
              ? 'bg-primary/10 text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
          }`}
          data-testid="tab-apikeys"
        >
          <Key size={16} />
          Clés API
          <span className="text-xs bg-secondary px-2 py-0.5 rounded-full">{apiKeys.length}</span>
        </button>
      </div>

      {/* API Keys Tab Content */}
      {activeTab === 'apikeys' && (
        <>
          {/* Info Card */}
          <div className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                <Key className="text-purple-400" size={20} />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Clés API pour développeurs</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Intégrez Monity World directement dans votre application via notre API REST. 
                  Authentifiez vos requêtes avec votre clé API et clé secrète.
                </p>
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Shield size={12} />Authentification sécurisée</span>
                  <span className="flex items-center gap-1"><Globe size={12} />API REST complète</span>
                </div>
              </div>
            </div>
          </div>

          {/* API Keys List */}
          {apiKeys.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-12 text-center">
              <Key size={48} className="mx-auto text-muted-foreground mb-3 opacity-50" />
              <h3 className="font-semibold text-foreground">Aucune clé API</h3>
              <p className="text-sm text-muted-foreground mt-1">Créez votre première clé pour intégrer les paiements dans votre application</p>
              <Button className="mt-4" onClick={() => setShowCreateApiKey(true)} data-testid="create-first-apikey">
                <Plus size={16} className="mr-2" />
                Créer ma première clé API
              </Button>
            </div>
          ) : (
            <div className="space-y-3" data-testid="api-keys-list">
              {apiKeys.map(key => (
                <div 
                  key={key.id} 
                  className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 transition-colors"
                  data-testid={`api-key-${key.id}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        key.is_active ? 'bg-green-500/10' : 'bg-gray-500/10'
                      }`}>
                        <Key size={18} className={key.is_active ? 'text-green-400' : 'text-gray-400'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-foreground truncate">{key.name}</h3>
                          {key.is_active ? (
                            <span className="badge-completed flex items-center gap-1"><CheckCircle size={12} />Active</span>
                          ) : (
                            <span className="badge-rejected flex items-center gap-1"><XCircle size={12} />Inactive</span>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2 mt-1">
                          <code className="text-xs bg-secondary px-2 py-1 rounded font-mono text-muted-foreground">
                            {key.api_key.substring(0, 20)}...
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2"
                            onClick={() => copyToClipboard(key.api_key, `key-${key.id}`)}
                          >
                            {copiedId === `key-${key.id}` ? <Check size={12} /> : <Copy size={12} />}
                          </Button>
                        </div>
                        
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          {key.website_url && (
                            <span className="flex items-center gap-1">
                              <Globe size={12} />{key.website_url}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <BarChart3 size={12} />
                            {key.total_transactions || 0} transactions
                          </span>
                          {key.last_used && (
                            <span>Dernière utilisation: {formatDate(key.last_used)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => viewApiKeyDetails(key)}
                        data-testid={`view-key-${key.id}`}
                      >
                        <Eye size={14} />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => regenerateApiSecret(key.id)}
                        title="Régénérer la clé secrète"
                      >
                        <RefreshCw size={14} />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleApiKeyStatus(key)}
                      >
                        {key.is_active ? <Pause size={14} /> : <Play size={14} />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteApiKey(key.id)}
                        className="text-muted-foreground hover:text-red-400"
                        data-testid={`delete-key-${key.id}`}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Links Tab Content */}
      {activeTab === 'links' && (
        <>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
              <ArrowDownLeft className="text-green-400" size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Liens de Réception</h3>
              <p className="text-xs text-muted-foreground">Recevez des paiements de vos clients</p>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <ArrowUpRight className="text-blue-400" size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Liens d'Envoi</h3>
              <p className="text-xs text-muted-foreground">Envoyez de l'argent à vos bénéficiaires</p>
            </div>
          </div>
        </div>
      </div>

      {/* Create Link Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg animate-fade-in-up" data-testid="create-ecommerce-modal">
            <h3 className="text-lg font-semibold text-foreground mb-4">Créer un lien e-commerce</h3>
            
            <div className="space-y-4">
              {/* Link Type */}
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Type de lien</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setLinkType('receive')}
                    className={`p-3 rounded-lg border transition-all flex items-center gap-2 ${
                      linkType === 'receive' 
                        ? 'bg-green-500/10 border-green-500/50 text-green-400' 
                        : 'bg-secondary border-border text-muted-foreground hover:border-primary/30'
                    }`}
                    data-testid="link-type-receive"
                  >
                    <ArrowDownLeft size={18} />
                    <div className="text-left">
                      <div className="font-medium text-foreground">Recevoir</div>
                      <div className="text-xs">Clients vous paient</div>
                    </div>
                  </button>
                  <button
                    onClick={() => setLinkType('send')}
                    className={`p-3 rounded-lg border transition-all flex items-center gap-2 ${
                      linkType === 'send' 
                        ? 'bg-blue-500/10 border-blue-500/50 text-blue-400' 
                        : 'bg-secondary border-border text-muted-foreground hover:border-primary/30'
                    }`}
                    data-testid="link-type-send"
                  >
                    <ArrowUpRight size={18} />
                    <div className="text-left">
                      <div className="font-medium text-foreground">Envoyer</div>
                      <div className="text-xs">Vous payez clients</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Link Duration */}
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Durée du lien</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setIsPermanent(false)}
                    className={`p-3 rounded-lg border transition-all ${
                      !isPermanent 
                        ? 'bg-primary/10 border-primary/50' 
                        : 'bg-secondary border-border hover:border-primary/30'
                    }`}
                    data-testid="link-temporary"
                  >
                    <div className="font-medium text-foreground">Temporaire</div>
                    <div className="text-xs text-muted-foreground">Montant fixe, expire en 24h</div>
                  </button>
                  <button
                    onClick={() => setIsPermanent(true)}
                    className={`p-3 rounded-lg border transition-all ${
                      isPermanent 
                        ? 'bg-primary/10 border-primary/50' 
                        : 'bg-secondary border-border hover:border-primary/30'
                    }`}
                    data-testid="link-permanent"
                  >
                    <div className="font-medium text-foreground">Permanent</div>
                    <div className="text-xs text-muted-foreground">Montant variable, sans expiration</div>
                  </button>
                </div>
              </div>

              {/* Amount (only for temporary) */}
              {!isPermanent && (
                <div>
                  <label className="text-sm text-muted-foreground">Montant fixe</label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="flex-1"
                      data-testid="link-amount"
                    />
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="bg-secondary border border-border rounded-lg px-3 text-foreground"
                      data-testid="link-currency"
                    >
                      {wallets.map(w => (
                        <option key={w.currency} value={w.currency}>{w.currency}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Currency (for permanent) */}
              {isPermanent && (
                <div>
                  <label className="text-sm text-muted-foreground">Devise</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full mt-1 bg-secondary border border-border rounded-lg px-3 py-2 text-foreground"
                    data-testid="link-currency-permanent"
                  >
                    {wallets.map(w => (
                      <option key={w.currency} value={w.currency}>{w.currency}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Description */}
              <div>
                <label className="text-sm text-muted-foreground">Description</label>
                <Input
                  placeholder="Ex: Paiement boutique en ligne"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1"
                  data-testid="link-description"
                />
              </div>

              {/* Info Box */}
              <div className="bg-secondary/50 rounded-lg p-3 text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Comment ça marche ?</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>Intégrez le lien dans votre site e-commerce</li>
                  <li>Le site fournit le numéro de téléphone {linkType === 'receive' ? "du payeur" : "du bénéficiaire"}</li>
                  {isPermanent && <li>Le site fournit également le montant de la transaction</li>}
                  <li>Un code de validation est envoyé au compte Monity pour sécuriser la transaction</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="ghost" className="flex-1" onClick={() => { setShowCreate(false); resetForm(); }}>
                Annuler
              </Button>
              <Button className="flex-1" onClick={createLink} data-testid="confirm-create-link">
                Créer le lien
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Transactions Modal */}
      {showTransactions && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto animate-fade-in-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">
                Transactions - {showTransactions.description}
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setShowTransactions(null)}>
                <XCircle size={16} />
              </Button>
            </div>
            
            {transactions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Aucune transaction pour ce lien
              </div>
            ) : (
              <div className="space-y-2">
                {transactions.map(tx => (
                  <div key={tx.id} className="bg-secondary/50 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-foreground">
                          {tx.sender_name} → {tx.receiver_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(tx.created_at)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-primary">
                          {CURRENCY_SYMBOLS[tx.currency]}{tx.amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Frais: {CURRENCY_SYMBOLS[tx.currency]}{tx.fee.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Links List */}
      {links.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-12 text-center">
          <Link2 size={48} className="mx-auto text-muted-foreground mb-3 opacity-50" />
          <h3 className="font-semibold text-foreground">Aucun lien e-commerce</h3>
          <p className="text-sm text-muted-foreground mt-1">Créez des liens pour intégrer les paiements dans vos sites</p>
          <Button className="mt-4" onClick={() => setShowCreate(true)}>
            <Plus size={16} className="mr-2" />
            Créer mon premier lien
          </Button>
        </div>
      ) : (
        <div className="space-y-3" data-testid="ecommerce-links-list">
          {links.map(link => (
            <div 
              key={link.id} 
              className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 transition-colors"
              data-testid={`ecommerce-link-${link.id}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    link.link_type === 'receive' ? 'bg-green-500/10' : 'bg-blue-500/10'
                  }`}>
                    {link.link_type === 'receive' 
                      ? <ArrowDownLeft size={18} className="text-green-400" />
                      : <ArrowUpRight size={18} className="text-blue-400" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground truncate">{link.description}</h3>
                      {getStatusBadge(link)}
                      {getLinkTypeBadge(link)}
                    </div>
                    
                    <div className="flex items-center gap-3 mt-1 text-sm">
                      {link.fixed_amount ? (
                        <span className="font-bold text-primary">
                          {CURRENCY_SYMBOLS[link.currency]}{link.fixed_amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic">Montant variable</span>
                      )}
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        link.is_permanent 
                          ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' 
                          : 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                      }`}>
                        {link.is_permanent ? 'Permanent' : 'Temporaire'}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="font-mono">{link.link_code}</span>
                      <span className="flex items-center gap-1">
                        <BarChart3 size={12} />
                        {link.total_transactions} transactions
                      </span>
                      <span>
                        Volume: {CURRENCY_SYMBOLS[link.currency]}{link.total_volume.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyLink(link)}
                    data-testid={`copy-link-${link.id}`}
                  >
                    {copiedId === link.id ? <Check size={14} /> : <Copy size={14} />}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => viewTransactions(link)}
                  >
                    <Eye size={14} />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleLinkStatus(link)}
                  >
                    {link.status === 'active' ? <Pause size={14} /> : <Play size={14} />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteLink(link.id)}
                    className="text-muted-foreground hover:text-red-400"
                    data-testid={`delete-link-${link.id}`}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      </>
      )}

      {/* Create API Key Modal */}
      {showCreateApiKey && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg animate-fade-in-up max-h-[90vh] overflow-y-auto" data-testid="create-apikey-modal">
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Key size={20} className="text-primary" />
              Créer une clé API
            </h3>
            
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="text-sm text-muted-foreground">Nom de la clé *</label>
                <Input
                  placeholder="Ex: Ma boutique en ligne"
                  value={apiKeyName}
                  onChange={(e) => setApiKeyName(e.target.value)}
                  className="mt-1"
                  data-testid="apikey-name"
                />
              </div>

              {/* Website URL */}
              <div>
                <label className="text-sm text-muted-foreground">URL du site web</label>
                <Input
                  placeholder="https://www.monsite.com"
                  value={apiKeyWebsite}
                  onChange={(e) => setApiKeyWebsite(e.target.value)}
                  className="mt-1"
                  data-testid="apikey-website"
                />
              </div>

              {/* Webhook URL */}
              <div>
                <label className="text-sm text-muted-foreground">URL de webhook</label>
                <Input
                  placeholder="https://www.monsite.com/webhook/monity"
                  value={apiKeyWebhook}
                  onChange={(e) => setApiKeyWebhook(e.target.value)}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">URL pour recevoir les notifications de paiement</p>
              </div>

              {/* Allowed IPs */}
              <div>
                <label className="text-sm text-muted-foreground">IPs autorisées (optionnel)</label>
                <Input
                  placeholder="192.168.1.1, 10.0.0.1"
                  value={apiKeyIps}
                  onChange={(e) => setApiKeyIps(e.target.value)}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">Séparez les IPs par des virgules. Vide = toutes les IPs autorisées</p>
              </div>

              {/* Daily Limit */}
              <div>
                <label className="text-sm text-muted-foreground">Limite journalière (USD)</label>
                <Input
                  type="number"
                  placeholder="Ex: 10000"
                  value={apiKeyDailyLimit}
                  onChange={(e) => setApiKeyDailyLimit(e.target.value)}
                  className="mt-1"
                />
              </div>

              {/* Permissions */}
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Permissions</label>
                <div className="space-y-2">
                  {AVAILABLE_PERMISSIONS.map(perm => (
                    <label 
                      key={perm.value} 
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        apiKeyPermissions.includes(perm.value)
                          ? 'bg-primary/10 border-primary/50'
                          : 'bg-secondary border-border hover:border-primary/30'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={apiKeyPermissions.includes(perm.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setApiKeyPermissions([...apiKeyPermissions, perm.value]);
                          } else {
                            setApiKeyPermissions(apiKeyPermissions.filter(p => p !== perm.value));
                          }
                        }}
                        className="mt-1 accent-primary"
                      />
                      <div>
                        <div className="font-medium text-foreground text-sm">{perm.label}</div>
                        <div className="text-xs text-muted-foreground">{perm.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Warning */}
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle size={16} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-400">
                  La clé secrète ne sera affichée qu'une seule fois lors de la création. Conservez-la dans un endroit sûr.
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="ghost" className="flex-1" onClick={() => { setShowCreateApiKey(false); resetApiKeyForm(); }}>
                Annuler
              </Button>
              <Button className="flex-1" onClick={createApiKey} data-testid="confirm-create-apikey">
                Créer la clé API
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* New Key Secret Modal */}
      {showNewKeySecret && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg animate-fade-in-up" data-testid="new-key-secret-modal">
            <div className="text-center mb-4">
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                <CheckCircle size={32} className="text-green-400" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                {showNewKeySecret.regenerated ? 'Nouvelle clé secrète générée !' : 'Clé API créée avec succès !'}
              </h3>
            </div>
            
            <div className="space-y-4">
              {/* API Key */}
              {showNewKeySecret.api_key && (
                <div>
                  <label className="text-sm text-muted-foreground flex items-center gap-2">
                    <Key size={14} />
                    Clé API (publique)
                  </label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="flex-1 bg-secondary px-3 py-2 rounded-lg font-mono text-sm text-foreground break-all">
                      {showNewKeySecret.api_key}
                    </code>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => copyToClipboard(showNewKeySecret.api_key, 'new-api-key')}
                    >
                      {copiedId === 'new-api-key' ? <Check size={14} /> : <Copy size={14} />}
                    </Button>
                  </div>
                </div>
              )}

              {/* API Secret */}
              <div>
                <label className="text-sm text-muted-foreground flex items-center gap-2">
                  <Shield size={14} />
                  Clé secrète
                </label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 bg-secondary px-3 py-2 rounded-lg font-mono text-sm text-foreground break-all">
                    {showNewKeySecret.api_secret}
                  </code>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => copyToClipboard(showNewKeySecret.api_secret, 'new-api-secret')}
                  >
                    {copiedId === 'new-api-secret' ? <Check size={14} /> : <Copy size={14} />}
                  </Button>
                </div>
              </div>

              {/* Warning */}
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-400">IMPORTANT</p>
                    <p className="text-xs text-red-400/80 mt-1">
                      Copiez et sauvegardez votre clé secrète maintenant. Elle ne sera plus jamais affichée !
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <Button 
              className="w-full mt-6" 
              onClick={() => setShowNewKeySecret(null)}
              data-testid="close-new-key-modal"
            >
              J'ai sauvegardé ma clé, fermer
            </Button>
          </div>
        </div>
      )}

      {/* API Key Details Modal */}
      {showApiKeyDetails && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg animate-fade-in-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Key size={20} className="text-primary" />
                Détails de la clé API
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setShowApiKeyDetails(null)}>
                <XCircle size={16} />
              </Button>
            </div>
            
            <div className="space-y-4">
              <div className="bg-secondary/50 rounded-lg p-4">
                <h4 className="font-semibold text-foreground">{showApiKeyDetails.name}</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Créée le {formatDate(showApiKeyDetails.created_at)}
                </p>
              </div>

              {/* API Key */}
              <div>
                <label className="text-sm text-muted-foreground">Clé API</label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 bg-secondary px-3 py-2 rounded-lg font-mono text-xs text-foreground break-all">
                    {showApiKeyDetails.api_key}
                  </code>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => copyToClipboard(showApiKeyDetails.api_key, 'details-api-key')}
                  >
                    {copiedId === 'details-api-key' ? <Check size={14} /> : <Copy size={14} />}
                  </Button>
                </div>
              </div>

              {/* Stats */}
              {showApiKeyDetails.stats && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-secondary/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Transactions</p>
                    <p className="text-xl font-bold text-foreground">{showApiKeyDetails.stats.total_count || 0}</p>
                  </div>
                  <div className="bg-secondary/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Volume total</p>
                    <p className="text-xl font-bold text-foreground">${showApiKeyDetails.stats.total_received?.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) || '0.00'}</p>
                  </div>
                </div>
              )}

              {/* Details Grid */}
              <div className="space-y-3">
                {showApiKeyDetails.website_url && (
                  <div className="flex items-center justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Site web</span>
                    <span className="text-sm text-foreground">{showApiKeyDetails.website_url}</span>
                  </div>
                )}
                {showApiKeyDetails.webhook_url && (
                  <div className="flex items-center justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Webhook</span>
                    <span className="text-sm text-foreground truncate max-w-[200px]">{showApiKeyDetails.webhook_url}</span>
                  </div>
                )}
                {showApiKeyDetails.daily_limit && (
                  <div className="flex items-center justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Limite journalière</span>
                    <span className="text-sm text-foreground">${showApiKeyDetails.daily_limit.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-sm text-muted-foreground">Statut</span>
                  {showApiKeyDetails.is_active ? (
                    <span className="badge-completed">Active</span>
                  ) : (
                    <span className="badge-rejected">Inactive</span>
                  )}
                </div>
              </div>

              {/* Permissions */}
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Permissions</label>
                <div className="flex flex-wrap gap-2">
                  {showApiKeyDetails.permissions?.map(perm => (
                    <span key={perm} className="px-2 py-1 rounded-lg text-xs bg-primary/10 text-primary border border-primary/20">
                      {AVAILABLE_PERMISSIONS.find(p => p.value === perm)?.label || perm}
                    </span>
                  ))}
                </div>
              </div>

              {/* Allowed IPs */}
              {showApiKeyDetails.allowed_ips && showApiKeyDetails.allowed_ips.length > 0 && (
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">IPs autorisées</label>
                  <div className="flex flex-wrap gap-2">
                    {showApiKeyDetails.allowed_ips.map((ip, i) => (
                      <span key={i} className="px-2 py-1 rounded-lg text-xs bg-secondary text-muted-foreground font-mono">
                        {ip}
                      </span>
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
