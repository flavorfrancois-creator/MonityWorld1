import { useState, useEffect, useCallback } from 'react';
import API from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Badge } from '../../components/ui/badge';
import { 
  Search, Plus, ChevronLeft, ChevronRight, CheckCircle2, XCircle, 
  Building2, Phone, Mail, MapPin, DollarSign, Eye, Pause, Play,
  Clock, Wallet, TrendingUp, Users
} from 'lucide-react';

const STATUS_CONFIG = {
  pending: { label: 'En attente', color: 'bg-yellow-500/10 text-yellow-400', icon: Clock },
  approved: { label: 'Approuvé', color: 'bg-green-500/10 text-green-400', icon: CheckCircle2 },
  suspended: { label: 'Suspendu', color: 'bg-red-500/10 text-red-400', icon: Pause }
};

export default function AdminPartners() {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedPartner, setSelectedPartner] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTopupModal, setShowTopupModal] = useState(false);
  const [showTransactionsModal, setShowTransactionsModal] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [countries, setCountries] = useState([]);
  
  const [formData, setFormData] = useState({
    name: '', phone: '', email: '', business_name: '', 
    business_address: '', country: 'CD', commission_rate: 2.0, notes: ''
  });
  const [topupData, setTopupData] = useState({ amount: '', currency: 'USD', payment_method: 'cash', reference: '' });
  
  // Get dial code for selected country
  const getDialCode = (countryCode) => {
    const country = countries.find(c => c.code === countryCode);
    return country?.dial_code || '+243';
  };
  
  // Handle country change and update phone prefix
  const handleCountryChange = (countryCode) => {
    const dialCode = getDialCode(countryCode);
    const currentPhone = formData.phone;
    // If phone is empty or starts with a dial code, replace with new dial code
    let newPhone = dialCode;
    if (currentPhone && !currentPhone.startsWith('+')) {
      newPhone = dialCode + currentPhone;
    } else if (currentPhone) {
      // Extract number after dial code and add new dial code
      const numberPart = currentPhone.replace(/^\+\d+/, '');
      newPhone = dialCode + numberPart;
    }
    setFormData({...formData, country: countryCode, phone: newPhone});
  };
  
  const LIMIT = 15;

  const fetchPartners = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/admin/partners?page=${page}&limit=${LIMIT}`;
      if (statusFilter) url += `&status=${statusFilter}`;
      const res = await API.get(url);
      setPartners(res.data.partners || []);
      setTotal(res.data.total || 0);
    } catch (e) { toast.error('Erreur de chargement'); }
    finally { setLoading(false); }
  }, [page, statusFilter]);

  const fetchCountries = async () => {
    try {
      const res = await API.get('/admin/services/overview');
      setCountries(res.data.countries || []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchPartners(); }, [fetchPartners]);
  useEffect(() => { fetchCountries(); }, []);

  const handleCreatePartner = async () => {
    if (!formData.name || !formData.phone || !formData.business_name) {
      toast.error('Veuillez remplir tous les champs obligatoires');
      return;
    }
    setProcessing(true);
    try {
      const res = await API.post('/manager/partners', formData);
      toast.success(`Partenaire créé. Mot de passe temporaire: ${res.data.temporary_password}`);
      setShowCreateModal(false);
      setFormData({ name: '', phone: '', email: '', business_name: '', business_address: '', country: 'CD', commission_rate: 2.0, notes: '' });
      fetchPartners();
    } catch (e) { toast.error(e.response?.data?.detail || 'Erreur'); }
    finally { setProcessing(false); }
  };

  const handleApprove = async (partnerId) => {
    setProcessing(true);
    try {
      await API.patch(`/admin/partners/${partnerId}/approve`);
      toast.success('Partenaire approuvé');
      fetchPartners();
    } catch (e) { toast.error('Erreur'); }
    finally { setProcessing(false); }
  };

  const handleSuspend = async (partnerId) => {
    setProcessing(true);
    try {
      await API.patch(`/admin/partners/${partnerId}/suspend`);
      toast.success('Partenaire suspendu');
      fetchPartners();
    } catch (e) { toast.error('Erreur'); }
    finally { setProcessing(false); }
  };

  const handleReactivate = async (partnerId) => {
    setProcessing(true);
    try {
      await API.patch(`/admin/partners/${partnerId}/reactivate`);
      toast.success('Partenaire réactivé');
      fetchPartners();
    } catch (e) { toast.error('Erreur'); }
    finally { setProcessing(false); }
  };

  const handleTopup = async () => {
    if (!topupData.amount || parseFloat(topupData.amount) <= 0) {
      toast.error('Montant invalide');
      return;
    }
    setProcessing(true);
    try {
      await API.post(`/manager/partners/${selectedPartner.id}/topup`, {
        partner_id: selectedPartner.id,
        amount: parseFloat(topupData.amount),
        currency: topupData.currency,
        payment_method: topupData.payment_method,
        reference: topupData.reference
      });
      toast.success('Rechargement effectué');
      setShowTopupModal(false);
      setTopupData({ amount: '', currency: 'USD', payment_method: 'cash', reference: '' });
      fetchPartners();
    } catch (e) { toast.error(e.response?.data?.detail || 'Erreur'); }
    finally { setProcessing(false); }
  };

  const viewTransactions = async (partner) => {
    setSelectedPartner(partner);
    setShowTransactionsModal(true);
    try {
      const res = await API.get(`/admin/partners/${partner.id}/transactions?limit=50`);
      setTransactions(res.data.transactions || []);
    } catch (e) { toast.error('Erreur'); }
  };

  const pages = Math.ceil(total / LIMIT);
  const filteredPartners = search 
    ? partners.filter(p => 
        p.name?.toLowerCase().includes(search.toLowerCase()) || 
        p.phone?.includes(search) ||
        p.business_name?.toLowerCase().includes(search.toLowerCase())
      )
    : partners;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in-up">
        <div>
          <h2 className="text-xl font-bold text-foreground" style={{fontFamily:'Manrope'}}>
            Gestion des Partenaires
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{total} partenaire{total > 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="btn-primary-glow" data-testid="create-partner-btn">
          <Plus size={16} className="mr-2" /> Nouveau Partenaire
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 animate-fade-in-up stagger-1">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." className="pl-9 h-9 text-sm" />
        </div>
        <Select value={statusFilter || "all"} onValueChange={v => setStatusFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Tous les statuts" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="pending">En attente</SelectItem>
            <SelectItem value="approved">Approuvés</SelectItem>
            <SelectItem value="suspended">Suspendus</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Partners Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in-up stagger-2">
        {loading ? (
          <div className="col-span-full text-center py-12 text-muted-foreground">Chargement...</div>
        ) : filteredPartners.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <Building2 size={48} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Aucun partenaire trouvé</p>
          </div>
        ) : filteredPartners.map(p => {
          const status = STATUS_CONFIG[p.status] || STATUS_CONFIG.pending;
          const StatusIcon = status.icon;
          return (
            <div key={p.id} className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 transition-all" data-testid={`partner-card-${p.id}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Building2 size={18} className="text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground">{p.business_name}</h3>
                    <p className="text-xs text-muted-foreground">{p.name}</p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1 ${status.color}`}>
                  <StatusIcon size={10} /> {status.label}
                </span>
              </div>

              <div className="space-y-2 text-sm mb-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone size={12} /> {p.phone}
                </div>
                {p.email && <div className="flex items-center gap-2 text-muted-foreground"><Mail size={12} /> {p.email}</div>}
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin size={12} /> {p.country}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-secondary/30 rounded-lg p-2 text-center">
                  <p className="text-xs text-muted-foreground">Solde</p>
                  <p className="font-semibold text-foreground">${p.balance?.toFixed(2) || '0.00'}</p>
                </div>
                <div className="bg-secondary/30 rounded-lg p-2 text-center">
                  <p className="text-xs text-muted-foreground">Commission</p>
                  <p className="font-semibold text-green-400">${p.total_commission?.toFixed(2) || '0.00'}</p>
                </div>
              </div>

              <div className="flex gap-2">
                {p.status === 'pending' && (
                  <Button size="sm" onClick={() => handleApprove(p.id)} disabled={processing} className="flex-1 bg-green-500/10 text-green-400 hover:bg-green-500/20" data-testid={`approve-${p.id}`}>
                    <CheckCircle2 size={12} className="mr-1" /> Approuver
                  </Button>
                )}
                {p.status === 'approved' && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => { setSelectedPartner(p); setShowTopupModal(true); }} className="flex-1" data-testid={`topup-${p.id}`}>
                      <Wallet size={12} className="mr-1" /> Recharger
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleSuspend(p.id)} disabled={processing} className="text-red-400" data-testid={`suspend-${p.id}`}>
                      <Pause size={12} />
                    </Button>
                  </>
                )}
                {p.status === 'suspended' && (
                  <Button size="sm" onClick={() => handleReactivate(p.id)} disabled={processing} className="flex-1 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20">
                    <Play size={12} className="mr-1" /> Réactiver
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => viewTransactions(p)}><Eye size={12} /></Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}>
            <ChevronLeft size={14} />
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} sur {pages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(pages, p+1))} disabled={page === pages}>
            <ChevronRight size={14} />
          </Button>
        </div>
      )}

      {/* Create Partner Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="bg-card border-border sm:max-w-lg">
          <DialogHeader>
            <DialogTitle style={{fontFamily:'Manrope'}}>Nouveau Partenaire</DialogTitle>
            <DialogDescription>Créer un compte partenaire (en attente d'approbation)</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Country first - sets phone dial code */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Pays *</label>
                <Select value={formData.country} onValueChange={handleCountryChange}>
                  <SelectTrigger data-testid="partner-country"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {countries.map(c => (
                      <SelectItem key={c.code} value={c.code}>{c.flag} {c.name} ({c.dial_code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Commission (%)</label>
                <Input type="number" step="0.1" value={formData.commission_rate} onChange={e => setFormData({...formData, commission_rate: parseFloat(e.target.value)})} />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Nom complet *</label>
                <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Jean Dupont" data-testid="partner-name" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Téléphone *</label>
                <Input value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder={getDialCode(formData.country) + "..."} data-testid="partner-phone" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Email</label>
              <Input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="email@example.com" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nom commercial *</label>
              <Input value={formData.business_name} onChange={e => setFormData({...formData, business_name: e.target.value})} placeholder="Boutique ABC" data-testid="partner-business" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Adresse commerciale</label>
              <Input value={formData.business_address} onChange={e => setFormData({...formData, business_address: e.target.value})} placeholder="123 Rue..." />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
              <Textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder="Notes additionnelles..." className="h-16" />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowCreateModal(false)}>Annuler</Button>
              <Button className="flex-1 btn-primary-glow" onClick={handleCreatePartner} disabled={processing} data-testid="submit-partner">
                {processing ? 'Création...' : 'Créer le partenaire'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Topup Modal */}
      <Dialog open={showTopupModal} onOpenChange={setShowTopupModal}>
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle style={{fontFamily:'Manrope'}}>Recharger {selectedPartner?.business_name}</DialogTitle>
            <DialogDescription>Solde actuel: ${selectedPartner?.balance?.toFixed(2) || '0.00'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Montant</label>
              <Input type="number" value={topupData.amount} onChange={e => setTopupData({...topupData, amount: e.target.value})} placeholder="100" data-testid="topup-amount" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Devise</label>
                <Select value={topupData.currency} onValueChange={v => setTopupData({...topupData, currency: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="XAF">XAF</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Mode paiement</label>
                <Select value={topupData.payment_method} onValueChange={v => setTopupData({...topupData, payment_method: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Espèces</SelectItem>
                    <SelectItem value="bank_transfer">Virement</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Référence</label>
              <Input value={topupData.reference} onChange={e => setTopupData({...topupData, reference: e.target.value})} placeholder="REF-..." />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowTopupModal(false)}>Annuler</Button>
              <Button className="flex-1 btn-primary-glow" onClick={handleTopup} disabled={processing} data-testid="confirm-topup">
                {processing ? 'Traitement...' : 'Recharger'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Transactions Modal */}
      <Dialog open={showTransactionsModal} onOpenChange={setShowTransactionsModal}>
        <DialogContent className="bg-card border-border sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{fontFamily:'Manrope'}}>Transactions - {selectedPartner?.business_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            {transactions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Aucune transaction</p>
            ) : transactions.map(tx => (
              <div key={tx.id} className="bg-secondary/20 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground text-sm">{tx.type === 'topup' ? 'Rechargement' : tx.type === 'client_recharge' ? 'Recharge client' : tx.type === 'client_withdraw' ? 'Retrait client' : tx.type}</p>
                  <p className="text-xs text-muted-foreground">{tx.client_name || tx.manager_name || '-'}</p>
                  <p className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString('fr-FR')}</p>
                </div>
                <div className="text-right">
                  <p className={`font-semibold ${tx.type === 'topup' || tx.type === 'client_withdraw' ? 'text-green-400' : 'text-red-400'}`}>
                    {tx.type === 'topup' || tx.type === 'client_withdraw' ? '+' : '-'}{tx.amount} {tx.currency}
                  </p>
                  {tx.commission > 0 && <p className="text-xs text-green-400">Commission: +{tx.commission}</p>}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
