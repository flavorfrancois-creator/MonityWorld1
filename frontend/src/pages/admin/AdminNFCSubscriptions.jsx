import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import API from '../../utils/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import {
  CreditCard, Plus, RefreshCw, Calendar, AlertTriangle, Check,
  Loader2, DollarSign, Clock, Settings, Shield, X
} from 'lucide-react';

const CARD_TYPES = [
  { value: 'basic', label: 'Basic', color: 'bg-gray-500' },
  { value: 'standard', label: 'Standard', color: 'bg-blue-500' },
  { value: 'premium', label: 'Premium', color: 'bg-yellow-500' }
];

export default function AdminNFCSubscriptions() {
  const [activeTab, setActiveTab] = useState('cards');
  const [loading, setLoading] = useState(true);
  
  // Cards state
  const [expiredData, setExpiredData] = useState({
    expired_subscriptions: [],
    expiring_soon: [],
    card_validity_expired: [],
    counts: {}
  });
  
  // Subscription fees
  const [fees, setFees] = useState([]);
  const [showFeeModal, setShowFeeModal] = useState(false);
  const [feeForm, setFeeForm] = useState({
    country_code: '',
    card_type: 'basic',
    annual_fee: 10,
    currency: 'USD',
    is_active: true
  });
  
  // Create NFC card modal
  const [showCreateCard, setShowCreateCard] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    currency: 'USD',
    initial_balance: 0,
    limit: 1000,
    nfc_serial_number: '',
    card_pin: '',
    nfc_card_type: 'basic'
  });
  const [actionLoading, setActionLoading] = useState(false);

  const fetchExpiredCards = useCallback(async () => {
    try {
      const res = await API.get('/admin/nfc-cards/expired');
      setExpiredData(res.data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchFees = useCallback(async () => {
    try {
      const res = await API.get('/admin/nfc-subscription-fees');
      setFees(res.data.fees || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchExpiredCards(), fetchFees()]).finally(() => setLoading(false));
  }, [fetchExpiredCards, fetchFees]);

  const renewSubscription = async (cardId) => {
    if (!window.confirm('Renouveler l\'abonnement de cette carte pour 1 an ?')) return;
    
    try {
      const res = await API.post(`/admin/nfc-cards/${cardId}/renew-subscription`);
      toast.success(res.data.message);
      fetchExpiredCards();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    }
  };

  const saveFee = async () => {
    if (!feeForm.country_code || !feeForm.annual_fee) {
      toast.error('Veuillez remplir tous les champs');
      return;
    }
    
    setActionLoading(true);
    try {
      await API.post('/admin/nfc-subscription-fees', feeForm);
      toast.success('Frais d\'abonnement mis a jour');
      setShowFeeModal(false);
      setFeeForm({ country_code: '', card_type: 'basic', annual_fee: 10, currency: 'USD', is_active: true });
      fetchFees();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    } finally {
      setActionLoading(false);
    }
  };

  const createNFCCard = async () => {
    if (!createForm.name || !createForm.card_pin || createForm.card_pin.length !== 4) {
      toast.error('Nom et PIN (4 chiffres) requis');
      return;
    }
    
    setActionLoading(true);
    try {
      const res = await API.post('/admin/nfc-cards/create', createForm);
      toast.success(res.data.message);
      setShowCreateCard(false);
      setCreateForm({
        name: '',
        currency: 'USD',
        initial_balance: 0,
        limit: 1000,
        nfc_serial_number: '',
        card_pin: '',
        nfc_card_type: 'basic'
      });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  const CardItem = ({ card, showRenew = false, isExpired = false }) => (
    <div className={`bg-card border rounded-xl p-4 ${isExpired ? 'border-red-500/50' : 'border-border'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
            isExpired ? 'bg-red-500/10' : 'bg-secondary'
          }`}>
            <CreditCard className={isExpired ? 'text-red-400' : 'text-primary'} size={24} />
          </div>
          <div>
            <p className="font-medium text-foreground">{card.name}</p>
            <p className="text-sm text-muted-foreground font-mono">{card.printed_card_number || card.nfc_serial_number || 'Sans NFC'}</p>
            <div className="flex gap-2 mt-1">
              <Badge variant="outline" className="text-xs">
                {card.nfc_card_type || 'basic'}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {card.currency}
              </Badge>
            </div>
          </div>
        </div>
        
        <div className="text-right">
          <div className="flex items-center gap-2 text-sm">
            <Calendar size={14} className="text-muted-foreground" />
            <span className="text-muted-foreground">Carte: {card.card_expiry_date}</span>
          </div>
          <div className="flex items-center gap-2 text-sm mt-1">
            <Clock size={14} className={isExpired ? 'text-red-400' : 'text-yellow-400'} />
            <span className={isExpired ? 'text-red-400' : 'text-yellow-400'}>
              Abo: {card.subscription_expiry?.slice(0, 10) || 'N/A'}
            </span>
          </div>
          <div className="text-sm text-foreground mt-1 font-medium">
            Solde: {card.balance?.toFixed(2)} {card.currency}
          </div>
          
          {showRenew && !isExpired && (
            <Button size="sm" className="mt-2" onClick={() => renewSubscription(card.id)} data-testid={`renew-${card.id}`}>
              <RefreshCw size={14} className="mr-1" /> Renouveler
            </Button>
          )}
          
          {isExpired && (
            <Badge className="mt-2 bg-red-500/20 text-red-400">
              <X size={12} className="mr-1" /> Carte expiree
            </Badge>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2" style={{fontFamily:'Manrope'}}>
            <CreditCard className="text-primary" /> Cartes NFC & Abonnements
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Gerez les cartes NFC, validites et abonnements annuels</p>
        </div>
        <Button onClick={() => setShowCreateCard(true)} className="btn-primary-glow" data-testid="create-nfc-card-btn">
          <Plus size={16} className="mr-2" /> Creer Carte NFC
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-red-400" size={24} />
            <div>
              <p className="text-2xl font-bold text-red-400">{expiredData.counts.expired_subscriptions || 0}</p>
              <p className="text-sm text-red-300">Abonnements expires</p>
            </div>
          </div>
        </div>
        
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <Clock className="text-yellow-400" size={24} />
            <div>
              <p className="text-2xl font-bold text-yellow-400">{expiredData.counts.expiring_soon || 0}</p>
              <p className="text-sm text-yellow-300">Expirent bientot (30j)</p>
            </div>
          </div>
        </div>
        
        <div className="bg-gray-500/10 border border-gray-500/30 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <Shield className="text-gray-400" size={24} />
            <div>
              <p className="text-2xl font-bold text-gray-400">{expiredData.counts.card_validity_expired || 0}</p>
              <p className="text-sm text-gray-300">Cartes 3 ans expirees</p>
            </div>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="cards" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Cartes a renouveler
          </TabsTrigger>
          <TabsTrigger value="fees" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Tarifs Abonnements
          </TabsTrigger>
        </TabsList>

        {/* Cards Tab */}
        <TabsContent value="cards" className="mt-4 space-y-6">
          {/* Expired Subscriptions */}
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <AlertTriangle className="text-red-400" size={18} /> Abonnements expires
            </h3>
            {expiredData.expired_subscriptions.length === 0 ? (
              <p className="text-muted-foreground text-sm">Aucun abonnement expire</p>
            ) : (
              <div className="space-y-3">
                {expiredData.expired_subscriptions.map((card) => (
                  <CardItem key={card.id} card={card} showRenew />
                ))}
              </div>
            )}
          </div>

          {/* Expiring Soon */}
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <Clock className="text-yellow-400" size={18} /> Expirent dans 30 jours
            </h3>
            {expiredData.expiring_soon.length === 0 ? (
              <p className="text-muted-foreground text-sm">Aucune carte</p>
            ) : (
              <div className="space-y-3">
                {expiredData.expiring_soon.map((card) => (
                  <CardItem key={card.id} card={card} showRenew />
                ))}
              </div>
            )}
          </div>

          {/* Card Validity Expired (3 years) */}
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <X className="text-gray-400" size={18} /> Cartes expirees (3 ans)
            </h3>
            {expiredData.card_validity_expired.length === 0 ? (
              <p className="text-muted-foreground text-sm">Aucune carte expiree</p>
            ) : (
              <div className="space-y-3">
                {expiredData.card_validity_expired.map((card) => (
                  <CardItem key={card.id} card={card} isExpired />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Fees Tab */}
        <TabsContent value="fees" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowFeeModal(true)} className="btn-primary-glow" data-testid="add-fee-btn">
              <Plus size={16} className="mr-2" /> Definir Tarif
            </Button>
          </div>

          {fees.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <DollarSign size={48} className="mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">Aucun tarif configure</p>
              <p className="text-sm text-muted-foreground mt-1">Tarif par defaut: 10 USD/an</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {fees.map((fee, idx) => (
                <div key={idx} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Badge className={`${CARD_TYPES.find(t => t.value === fee.card_type)?.color} text-white`}>
                      {fee.card_type}
                    </Badge>
                    <div>
                      <p className="font-medium text-foreground">Pays: {fee.country_code}</p>
                      <p className="text-sm text-muted-foreground">Type: {fee.card_type}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-primary">{fee.annual_fee} {fee.currency}</p>
                    <p className="text-sm text-muted-foreground">/an</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Fee Modal */}
      {showFeeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md animate-scale-in">
            <h3 className="text-lg font-semibold text-foreground mb-4">Definir Tarif d'Abonnement</h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Code Pays</Label>
                <Input 
                  placeholder="CD, CM, CI, FR..."
                  value={feeForm.country_code}
                  onChange={(e) => setFeeForm({...feeForm, country_code: e.target.value.toUpperCase()})}
                  maxLength={3}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Type de Carte</Label>
                <Select value={feeForm.card_type} onValueChange={(v) => setFeeForm({...feeForm, card_type: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CARD_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Frais Annuel</Label>
                  <Input 
                    type="number"
                    value={feeForm.annual_fee}
                    onChange={(e) => setFeeForm({...feeForm, annual_fee: parseFloat(e.target.value) || 0})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Devise</Label>
                  <Select value={feeForm.currency} onValueChange={(v) => setFeeForm({...feeForm, currency: v})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="XAF">XAF</SelectItem>
                      <SelectItem value="CDF">CDF</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => setShowFeeModal(false)}>
                Annuler
              </Button>
              <Button className="flex-1 btn-primary-glow" onClick={saveFee} disabled={actionLoading}>
                {actionLoading && <Loader2 size={16} className="mr-2 animate-spin" />}
                Enregistrer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create Card Modal */}
      {showCreateCard && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-lg animate-scale-in">
            <h3 className="text-lg font-semibold text-foreground mb-4">Creer Carte NFC</h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nom de la Carte *</Label>
                <Input 
                  placeholder="Ma Carte NFC"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({...createForm, name: e.target.value})}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Code PIN (4 chiffres) *</Label>
                  <Input 
                    type="password"
                    placeholder="****"
                    maxLength={4}
                    value={createForm.card_pin}
                    onChange={(e) => setCreateForm({...createForm, card_pin: e.target.value.replace(/\D/g, '')})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type de Carte</Label>
                  <Select value={createForm.nfc_card_type} onValueChange={(v) => setCreateForm({...createForm, nfc_card_type: v})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CARD_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Numero de Serie NFC (optionnel)</Label>
                <Input 
                  placeholder="05:G8:5F:54:22:75:Y5"
                  value={createForm.nfc_serial_number}
                  onChange={(e) => setCreateForm({...createForm, nfc_serial_number: e.target.value.toUpperCase()})}
                />
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Devise</Label>
                  <Select value={createForm.currency} onValueChange={(v) => setCreateForm({...createForm, currency: v})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="XAF">XAF</SelectItem>
                      <SelectItem value="CDF">CDF</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Solde Initial</Label>
                  <Input 
                    type="number"
                    value={createForm.initial_balance}
                    onChange={(e) => setCreateForm({...createForm, initial_balance: parseFloat(e.target.value) || 0})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Limite</Label>
                  <Input 
                    type="number"
                    value={createForm.limit}
                    onChange={(e) => setCreateForm({...createForm, limit: parseFloat(e.target.value) || 0})}
                  />
                </div>
              </div>
              
              <div className="p-3 bg-secondary/30 rounded-lg text-sm text-muted-foreground">
                <p><strong>Validite carte:</strong> 3 ans (non renouvelable)</p>
                <p><strong>Abonnement:</strong> 1 an (renouvelable)</p>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => setShowCreateCard(false)}>
                Annuler
              </Button>
              <Button className="flex-1 btn-primary-glow" onClick={createNFCCard} disabled={actionLoading}>
                {actionLoading && <Loader2 size={16} className="mr-2 animate-spin" />}
                Creer la Carte
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
