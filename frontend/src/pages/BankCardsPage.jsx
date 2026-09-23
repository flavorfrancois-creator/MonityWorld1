import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import API from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  CreditCard, Plus, Loader2, Trash2, Check, X, Clock,
  Smartphone, ArrowDownToLine, ArrowUpFromLine, Wifi, Shield
} from 'lucide-react';

const STATUS_CONFIG = {
  pending: { label: 'En attente', color: 'bg-yellow-500/20 text-yellow-400', icon: Clock },
  approved: { label: 'Approuvee', color: 'bg-green-500/20 text-green-400', icon: Check },
  rejected: { label: 'Rejetee', color: 'bg-red-500/20 text-red-400', icon: X }
};

const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', XAF: 'FCFA', XOF: 'FCFA', CDF: 'FC', GBP: '£' };

export default function BankCardsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('cards');
  const [loading, setLoading] = useState(true);
  
  // Bank cards
  const [bankCards, setBankCards] = useState([]);
  const [showAddCard, setShowAddCard] = useState(false);
  const [cardForm, setCardForm] = useState({
    card_type: 'visa',
    card_number: '',
    holder_name: '',
    expiry_month: '',
    expiry_year: '',
    billing_address: ''
  });
  
  // Mobile operators
  const [operators, setOperators] = useState([]);
  const [selectedOperator, setSelectedOperator] = useState(null);
  const [mobileAmount, setMobileAmount] = useState('');
  const [mobilePhone, setMobilePhone] = useState('');
  const [mobileAction, setMobileAction] = useState('deposit'); // deposit or withdraw
  const [mobileCurrency, setMobileCurrency] = useState('USD');
  
  const [actionLoading, setActionLoading] = useState(false);

  const fetchBankCards = useCallback(async () => {
    try {
      const res = await API.get('/bank-cards');
      setBankCards(res.data.cards || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchOperators = useCallback(async () => {
    try {
      const res = await API.get('/mobile-operators');
      setOperators(res.data.operators || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchBankCards(), fetchOperators()]).finally(() => setLoading(false));
  }, [fetchBankCards, fetchOperators]);

  // Add bank card
  const handleAddCard = async () => {
    // Basic validation
    const cleanNumber = cardForm.card_number.replace(/\s/g, '');
    if (cleanNumber.length < 13) {
      toast.error('Numero de carte invalide');
      return;
    }
    if (!cardForm.holder_name) {
      toast.error('Nom du titulaire requis');
      return;
    }
    if (!cardForm.expiry_month || !cardForm.expiry_year) {
      toast.error('Date d\'expiration requise');
      return;
    }
    
    setActionLoading(true);
    try {
      const res = await API.post('/bank-cards', {
        card_type: cardForm.card_type,
        card_number: cleanNumber,
        holder_name: cardForm.holder_name,
        expiry_month: parseInt(cardForm.expiry_month),
        expiry_year: parseInt(cardForm.expiry_year),
        billing_address: cardForm.billing_address || null
      });
      toast.success(res.data.message);
      setShowAddCard(false);
      setCardForm({
        card_type: 'visa',
        card_number: '',
        holder_name: '',
        expiry_month: '',
        expiry_year: '',
        billing_address: ''
      });
      fetchBankCards();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    } finally {
      setActionLoading(false);
    }
  };

  // Delete card
  const handleDeleteCard = async (cardId) => {
    if (!window.confirm('Supprimer cette carte ?')) return;
    
    try {
      await API.delete(`/bank-cards/${cardId}`);
      toast.success('Carte supprimee');
      fetchBankCards();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    }
  };

  // Mobile money transaction
  const handleMobileTransaction = async () => {
    if (!selectedOperator) {
      toast.error('Selectionnez un operateur');
      return;
    }
    if (!mobileAmount || parseFloat(mobileAmount) <= 0) {
      toast.error('Montant invalide');
      return;
    }
    if (!mobilePhone) {
      toast.error('Numero de telephone requis');
      return;
    }
    
    setActionLoading(true);
    try {
      const endpoint = mobileAction === 'deposit' ? '/mobile-payment/deposit' : '/mobile-payment/withdraw';
      const res = await API.post(endpoint, {
        operator_code: selectedOperator.operator_code,
        phone_number: mobilePhone,
        amount: parseFloat(mobileAmount),
        currency: mobileCurrency
      });
      
      toast.success(res.data.message);
      setMobileAmount('');
      setSelectedOperator(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    } finally {
      setActionLoading(false);
    }
  };

  // Format card number with spaces
  const formatCardNumber = (value) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = matches && matches[0] || '';
    const parts = [];
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }
    return parts.length ? parts.join(' ') : v;
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="text-center sm:text-left">
        <h2 className="text-xl font-bold text-foreground flex items-center justify-center sm:justify-start gap-2" style={{fontFamily:'Manrope'}}>
          <CreditCard className="text-primary" /> Cartes & Paiements
        </h2>
        <p className="text-sm text-muted-foreground mt-1">Gerez vos cartes bancaires et paiements mobiles</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full bg-secondary/50">
          <TabsTrigger value="cards" className="flex-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <CreditCard size={16} className="mr-2" /> Cartes Bancaires
          </TabsTrigger>
          <TabsTrigger value="mobile" className="flex-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Smartphone size={16} className="mr-2" /> Mobile Money
          </TabsTrigger>
        </TabsList>

        {/* Bank Cards Tab */}
        <TabsContent value="cards" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowAddCard(true)} className="btn-primary-glow" data-testid="add-bank-card-btn">
              <Plus size={16} className="mr-2" /> Ajouter une carte
            </Button>
          </div>

          {bankCards.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <CreditCard size={48} className="mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">Aucune carte bancaire enregistree</p>
              <p className="text-sm text-muted-foreground mt-2">Ajoutez une carte VISA ou MasterCard pour recharger votre compte ou effectuer des retraits.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {bankCards.map((card) => {
                const StatusIcon = STATUS_CONFIG[card.status]?.icon || Clock;
                return (
                  <div key={card.id} className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-14 h-10 rounded-lg flex items-center justify-center text-white font-bold text-xs ${
                          card.card_type === 'visa' ? 'bg-gradient-to-r from-blue-600 to-blue-800' : 'bg-gradient-to-r from-orange-500 to-red-600'
                        }`}>
                          {card.card_type?.toUpperCase()}
                        </div>
                        <div>
                          <p className="font-mono text-foreground text-lg">{card.masked_number}</p>
                          <p className="text-sm text-muted-foreground">{card.holder_name}</p>
                          <p className="text-xs text-muted-foreground">Exp: {String(card.expiry_month).padStart(2, '0')}/{card.expiry_year}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-end gap-1">
                          <Badge className={STATUS_CONFIG[card.status]?.color}>
                            <StatusIcon size={12} className="mr-1" />
                            {STATUS_CONFIG[card.status]?.label}
                          </Badge>
                          
                          <div className="flex gap-1">
                            {card.can_deposit && (
                              <Badge className="bg-green-500/20 text-green-400 text-xs">
                                <ArrowDownToLine size={10} className="mr-1" /> Depot
                              </Badge>
                            )}
                            {card.can_withdraw && (
                              <Badge className="bg-purple-500/20 text-purple-400 text-xs">
                                <ArrowUpFromLine size={10} className="mr-1" /> Retrait
                              </Badge>
                            )}
                          </div>
                        </div>
                        
                        <Button size="icon" variant="ghost" className="text-red-400 hover:bg-red-500/10" onClick={() => handleDeleteCard(card.id)} data-testid={`delete-card-${card.id}`}>
                          <Trash2 size={18} />
                        </Button>
                      </div>
                    </div>
                    
                    {card.status === 'pending' && (
                      <p className="text-sm text-yellow-400 mt-3 flex items-center gap-2">
                        <Clock size={14} /> Votre carte est en attente de verification par l'administrateur
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Mobile Money Tab */}
        <TabsContent value="mobile" className="mt-4 space-y-4">
          {operators.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <Smartphone size={48} className="mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">Aucun operateur mobile disponible</p>
              <p className="text-sm text-muted-foreground mt-2">Les operateurs mobiles pour votre pays n'ont pas encore ete configures.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Action Toggle */}
              <div className="flex gap-2 p-1 bg-secondary/50 rounded-lg">
                <Button 
                  variant={mobileAction === 'deposit' ? 'default' : 'ghost'}
                  className={`flex-1 ${mobileAction === 'deposit' ? 'bg-green-600 hover:bg-green-700' : ''}`}
                  onClick={() => setMobileAction('deposit')}
                >
                  <ArrowDownToLine size={16} className="mr-2" /> Deposer
                </Button>
                <Button 
                  variant={mobileAction === 'withdraw' ? 'default' : 'ghost'}
                  className={`flex-1 ${mobileAction === 'withdraw' ? 'bg-purple-600 hover:bg-purple-700' : ''}`}
                  onClick={() => setMobileAction('withdraw')}
                >
                  <ArrowUpFromLine size={16} className="mr-2" /> Retirer
                </Button>
              </div>

              {/* Operators Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {operators.map((op) => (
                  <button
                    key={op.operator_code}
                    className={`p-4 rounded-xl border transition-all ${
                      selectedOperator?.operator_code === op.operator_code
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-card hover:bg-secondary/50'
                    }`}
                    onClick={() => setSelectedOperator(op)}
                    data-testid={`operator-${op.operator_code}`}
                  >
                    <Wifi size={24} className={`mx-auto mb-2 ${selectedOperator?.operator_code === op.operator_code ? 'text-primary' : 'text-muted-foreground'}`} />
                    <p className="font-medium text-foreground text-sm">{op.operator_name}</p>
                    <p className="text-xs text-muted-foreground mt-1">Frais: {op.fee_percentage}%</p>
                  </button>
                ))}
              </div>

              {/* Transaction Form */}
              {selectedOperator && (
                <div className="bg-card border border-border rounded-xl p-5 space-y-4 animate-in fade-in">
                  <div className="flex items-center gap-3 mb-4">
                    <Wifi size={20} className="text-primary" />
                    <div>
                      <p className="font-semibold text-foreground">{selectedOperator.operator_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Min: {selectedOperator.min_amount} - Max: {selectedOperator.max_amount} | Frais: {selectedOperator.fee_percentage}%
                        {selectedOperator.fee_fixed > 0 ? ` + ${selectedOperator.fee_fixed}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Numero de telephone Mobile Money</Label>
                    <Input 
                      placeholder="+243 999 000 000"
                      value={mobilePhone}
                      onChange={(e) => setMobilePhone(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Montant</Label>
                      <Input 
                        type="number"
                        placeholder="100"
                        value={mobileAmount}
                        onChange={(e) => setMobileAmount(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Devise</Label>
                      <Select value={mobileCurrency} onValueChange={setMobileCurrency}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="EUR">EUR</SelectItem>
                          <SelectItem value="CDF">CDF</SelectItem>
                          <SelectItem value="XAF">XAF</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {mobileAmount && (
                    <div className="p-3 bg-secondary/30 rounded-lg text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Montant:</span>
                        <span className="text-foreground">{parseFloat(mobileAmount).toFixed(2)} {mobileCurrency}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Frais:</span>
                        <span className="text-foreground">
                          {(parseFloat(mobileAmount) * selectedOperator.fee_percentage / 100 + selectedOperator.fee_fixed).toFixed(2)} {mobileCurrency}
                        </span>
                      </div>
                      <div className="flex justify-between font-semibold pt-2 border-t border-border mt-2">
                        <span className="text-foreground">Total:</span>
                        <span className="text-primary">
                          {(parseFloat(mobileAmount) * (1 + selectedOperator.fee_percentage / 100) + selectedOperator.fee_fixed).toFixed(2)} {mobileCurrency}
                        </span>
                      </div>
                    </div>
                  )}

                  <Button 
                    className={`w-full ${mobileAction === 'deposit' ? 'bg-green-600 hover:bg-green-700' : 'bg-purple-600 hover:bg-purple-700'}`}
                    onClick={handleMobileTransaction}
                    disabled={actionLoading}
                    data-testid="mobile-transaction-btn"
                  >
                    {actionLoading && <Loader2 size={16} className="mr-2 animate-spin" />}
                    {mobileAction === 'deposit' ? 'Deposer maintenant' : 'Retirer maintenant'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Card Modal */}
      {showAddCard && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md animate-scale-in">
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <CreditCard className="text-primary" /> Ajouter une carte bancaire
            </h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Type de carte</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className={`p-3 rounded-lg border flex items-center justify-center gap-2 transition-all ${
                      cardForm.card_type === 'visa' ? 'border-blue-500 bg-blue-500/10' : 'border-border'
                    }`}
                    onClick={() => setCardForm({...cardForm, card_type: 'visa'})}
                  >
                    <div className="w-10 h-6 rounded bg-blue-600 flex items-center justify-center text-white text-xs font-bold">VISA</div>
                  </button>
                  <button
                    className={`p-3 rounded-lg border flex items-center justify-center gap-2 transition-all ${
                      cardForm.card_type === 'mastercard' ? 'border-orange-500 bg-orange-500/10' : 'border-border'
                    }`}
                    onClick={() => setCardForm({...cardForm, card_type: 'mastercard'})}
                  >
                    <div className="w-10 h-6 rounded bg-gradient-to-r from-orange-500 to-red-600 flex items-center justify-center text-white text-xs font-bold">MC</div>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Numero de carte</Label>
                <Input 
                  placeholder="1234 5678 9012 3456"
                  value={cardForm.card_number}
                  onChange={(e) => setCardForm({...cardForm, card_number: formatCardNumber(e.target.value)})}
                  maxLength={19}
                  className="font-mono text-lg"
                />
              </div>

              <div className="space-y-2">
                <Label>Nom du titulaire</Label>
                <Input 
                  placeholder="JEAN DUPONT"
                  value={cardForm.holder_name}
                  onChange={(e) => setCardForm({...cardForm, holder_name: e.target.value.toUpperCase()})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Mois d'expiration</Label>
                  <Select 
                    value={cardForm.expiry_month} 
                    onValueChange={(v) => setCardForm({...cardForm, expiry_month: v})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="MM" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                        <SelectItem key={m} value={String(m)}>{String(m).padStart(2, '0')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Annee d'expiration</Label>
                  <Select 
                    value={cardForm.expiry_year}
                    onValueChange={(v) => setCardForm({...cardForm, expiry_year: v})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="AAAA" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({length: 10}, (_, i) => new Date().getFullYear() + i).map(y => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-300 flex items-start gap-2">
                <Shield size={18} className="mt-0.5 flex-shrink-0" />
                <p>Votre carte sera verifiee par un administrateur avant d'etre activee pour les transactions.</p>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => setShowAddCard(false)}>
                Annuler
              </Button>
              <Button className="flex-1 btn-primary-glow" onClick={handleAddCard} disabled={actionLoading}>
                {actionLoading && <Loader2 size={16} className="mr-2 animate-spin" />}
                Ajouter
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
