import { useState, useEffect, useCallback } from 'react';
import API from '../utils/api';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { 
  Link2, Plus, Copy, Trash2, Check, ExternalLink, Clock, 
  CheckCircle, XCircle, Eye, EyeOff
} from 'lucide-react';

const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', XAF: 'FCFA', XOF: 'FCFA', GBP: '£', CNY: '¥', CDF: 'FC', NGN: '₦', GHS: '₵', RUB: '₽', CAD: 'C$', MXN: '$' };

export default function PaymentLinks() {
  const [links, setLinks] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  
  // Form states
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [description, setDescription] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [expiresHours, setExpiresHours] = useState('24');

  const fetchData = useCallback(async () => {
    try {
      const [linksRes, walletsRes] = await Promise.all([
        API.get('/payment-links'),
        API.get('/wallet/wallets')
      ]);
      setLinks(linksRes.data || []);
      setWallets(walletsRes.data || []);
    } catch (e) {
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const createLink = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Montant invalide');
      return;
    }
    if (!password || password.length < 4) {
      toast.error('Mot de passe requis (min 4 caractères)');
      return;
    }
    if (!description.trim()) {
      toast.error('Description requise');
      return;
    }
    
    try {
      await API.post('/payment-links', {
        amount: parseFloat(amount),
        currency,
        description: description.trim(),
        password,
        expires_hours: parseInt(expiresHours) || 24
      });
      toast.success('Lien de paiement créé !');
      setShowCreate(false);
      setAmount('');
      setDescription('');
      setPassword('');
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const copyLink = (link) => {
    const fullUrl = `${window.location.origin}/pay/${link.link_code}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedId(link.id);
    toast.success('Lien copié !');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const deleteLink = async (linkId) => {
    if (!window.confirm('Supprimer ce lien de paiement ?')) return;
    try {
      await API.delete(`/payment-links/${linkId}`);
      toast.success('Lien supprimé');
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const getStatusBadge = (link) => {
    if (link.status === 'paid') {
      return <span className="badge-completed flex items-center gap-1"><CheckCircle size={12} />Payé</span>;
    }
    const isExpired = new Date(link.expires_at) < new Date();
    if (isExpired) {
      return <span className="badge-rejected flex items-center gap-1"><XCircle size={12} />Expiré</span>;
    }
    return <span className="badge-pending flex items-center gap-1"><Clock size={12} />Actif</span>;
  };

  const formatExpiry = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = date - now;
    
    if (diff < 0) return 'Expiré';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}j ${hours % 24}h`;
    if (hours > 0) return `${hours}h`;
    return '< 1h';
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="skeleton h-24 w-full rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Manrope' }}>Liens de Paiement</h1>
          <p className="text-sm text-muted-foreground">Créez des liens pour recevoir des paiements</p>
        </div>
        <Button onClick={() => setShowCreate(true)} data-testid="create-link-btn">
          <Plus size={16} className="mr-2" />
          Nouveau lien
        </Button>
      </div>

      {/* Create Link Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md animate-fade-in-up" data-testid="create-link-modal">
            <h3 className="text-lg font-semibold text-foreground mb-4">Créer un lien de paiement</h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground">Montant</label>
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
              
              <div>
                <label className="text-sm text-muted-foreground">Description</label>
                <Input
                  placeholder="Ex: Paiement commande #123"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1"
                  data-testid="link-description"
                />
              </div>
              
              <div>
                <label className="text-sm text-muted-foreground">Mot de passe de validation</label>
                <div className="relative mt-1">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Mot de passe secret"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    data-testid="link-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Le payeur devra entrer ce mot de passe</p>
              </div>
              
              <div>
                <label className="text-sm text-muted-foreground">Expire dans</label>
                <select
                  value={expiresHours}
                  onChange={(e) => setExpiresHours(e.target.value)}
                  className="w-full mt-1 bg-secondary border border-border rounded-lg px-3 py-2 text-foreground"
                  data-testid="link-expires"
                >
                  <option value="1">1 heure</option>
                  <option value="6">6 heures</option>
                  <option value="24">24 heures</option>
                  <option value="72">3 jours</option>
                  <option value="168">7 jours</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="ghost" className="flex-1" onClick={() => setShowCreate(false)}>
                Annuler
              </Button>
              <Button className="flex-1" onClick={createLink} data-testid="confirm-create-link">
                Créer le lien
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Links List */}
      {links.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-12 text-center">
          <Link2 size={48} className="mx-auto text-muted-foreground mb-3 opacity-50" />
          <h3 className="font-semibold text-foreground">Aucun lien de paiement</h3>
          <p className="text-sm text-muted-foreground mt-1">Créez des liens pour recevoir des paiements facilement</p>
          <Button className="mt-4" onClick={() => setShowCreate(true)}>
            <Plus size={16} className="mr-2" />
            Créer mon premier lien
          </Button>
        </div>
      ) : (
        <div className="space-y-3" data-testid="payment-links-list">
          {links.map(link => (
            <div 
              key={link.id} 
              className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 transition-colors"
              data-testid={`payment-link-${link.id}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Link2 size={18} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground truncate">{link.description}</h3>
                      {getStatusBadge(link)}
                    </div>
                    <p className="text-lg font-bold text-primary mt-1">
                      {CURRENCY_SYMBOLS[link.currency]}{link.amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="font-mono">{link.link_code}</span>
                      {link.status !== 'paid' && (
                        <span className="flex items-center gap-1">
                          <Clock size={10} />
                          {formatExpiry(link.expires_at)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {link.status === 'active' && (
                    <>
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
                        onClick={() => window.open(`/pay/${link.link_code}`, '_blank')}
                      >
                        <ExternalLink size={14} />
                      </Button>
                    </>
                  )}
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
    </div>
  );
}
