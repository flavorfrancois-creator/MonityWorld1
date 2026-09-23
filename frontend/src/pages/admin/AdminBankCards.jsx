import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import API from '../../utils/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Textarea } from '../../components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import {
  CreditCard, Plus, Check, X, Loader2, Shield, Ban, 
  ArrowDownToLine, ArrowUpFromLine, Eye, Trash2, Search,
  Smartphone, Globe, Settings, Wifi, DollarSign
} from 'lucide-react';

const STATUS_CONFIG = {
  pending: { label: 'En attente', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  approved: { label: 'Approuvee', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  rejected: { label: 'Rejetee', color: 'bg-red-500/20 text-red-400 border-red-500/30' }
};

export default function AdminBankCards() {
  const [activeTab, setActiveTab] = useState('cards');
  const [loading, setLoading] = useState(true);
  
  // Bank cards state
  const [bankCards, setBankCards] = useState([]);
  const [cardFilter, setCardFilter] = useState('');
  const [cardPage, setCardPage] = useState(1);
  const [cardTotal, setCardTotal] = useState(0);
  
  // Mobile operators state
  const [operators, setOperators] = useState([]);
  const [showOperatorModal, setShowOperatorModal] = useState(false);
  const [editingOperator, setEditingOperator] = useState(null);
  
  // Action modal
  const [actionModal, setActionModal] = useState(null);
  const [actionNote, setActionNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  
  // Operator form
  const [operatorForm, setOperatorForm] = useState({
    country_code: '',
    operator_name: '',
    operator_code: '',
    api_base_url: '',
    api_key: '',
    api_secret: '',
    webhook_url: '',
    deposit_endpoint: '/deposit',
    withdrawal_endpoint: '/withdraw',
    balance_endpoint: '/balance',
    is_active: true,
    min_amount: 1,
    max_amount: 10000,
    fee_percentage: 1.5,
    fee_fixed: 0
  });

  const fetchBankCards = useCallback(async () => {
    try {
      const res = await API.get('/admin/bank-cards', {
        params: { status: cardFilter || undefined, page: cardPage, limit: 20 }
      });
      setBankCards(res.data.cards || []);
      setCardTotal(res.data.total || 0);
    } catch (err) {
      toast.error('Erreur lors du chargement des cartes');
    }
  }, [cardFilter, cardPage]);

  const fetchOperators = useCallback(async () => {
    try {
      const res = await API.get('/admin/mobile-operators');
      setOperators(res.data.operators || []);
    } catch (err) {
      toast.error('Erreur lors du chargement des operateurs');
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchBankCards(), fetchOperators()]).finally(() => setLoading(false));
  }, [fetchBankCards, fetchOperators]);

  // Bank card actions
  const handleCardAction = async (action) => {
    if (!actionModal) return;
    setActionLoading(true);
    
    try {
      await API.post(`/admin/bank-cards/${actionModal.id}/action`, {
        action,
        note: actionNote
      });
      toast.success(`Carte ${action === 'approve' ? 'approuvee' : action === 'reject' ? 'rejetee' : 'mise a jour'}`);
      setActionModal(null);
      setActionNote('');
      fetchBankCards();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    } finally {
      setActionLoading(false);
    }
  };

  // Mobile operator save
  const handleSaveOperator = async () => {
    if (!operatorForm.operator_code || !operatorForm.operator_name || !operatorForm.country_code) {
      toast.error('Veuillez remplir tous les champs obligatoires');
      return;
    }
    
    setActionLoading(true);
    try {
      await API.post('/admin/mobile-operators', operatorForm);
      toast.success('Operateur configure');
      setShowOperatorModal(false);
      resetOperatorForm();
      fetchOperators();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteOperator = async (code) => {
    if (!window.confirm('Supprimer cet operateur ?')) return;
    
    try {
      await API.delete(`/admin/mobile-operators/${code}`);
      toast.success('Operateur supprime');
      fetchOperators();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    }
  };

  const resetOperatorForm = () => {
    setOperatorForm({
      country_code: '',
      operator_name: '',
      operator_code: '',
      api_base_url: '',
      api_key: '',
      api_secret: '',
      webhook_url: '',
      deposit_endpoint: '/deposit',
      withdrawal_endpoint: '/withdraw',
      balance_endpoint: '/balance',
      is_active: true,
      min_amount: 1,
      max_amount: 10000,
      fee_percentage: 1.5,
      fee_fixed: 0
    });
    setEditingOperator(null);
  };

  const editOperator = (op) => {
    setOperatorForm({
      country_code: op.country_code,
      operator_name: op.operator_name,
      operator_code: op.operator_code,
      api_base_url: op.api_base_url || '',
      api_key: op.api_key || '',
      api_secret: '',
      webhook_url: op.webhook_url || '',
      deposit_endpoint: op.deposit_endpoint || '/deposit',
      withdrawal_endpoint: op.withdrawal_endpoint || '/withdraw',
      balance_endpoint: op.balance_endpoint || '/balance',
      is_active: op.is_active,
      min_amount: op.min_amount || 1,
      max_amount: op.max_amount || 10000,
      fee_percentage: op.fee_percentage || 1.5,
      fee_fixed: op.fee_fixed || 0
    });
    setEditingOperator(op);
    setShowOperatorModal(true);
  };

  // Group operators by country
  const operatorsByCountry = operators.reduce((acc, op) => {
    if (!acc[op.country_code]) acc[op.country_code] = [];
    acc[op.country_code].push(op);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2" style={{fontFamily:'Manrope'}}>
            <CreditCard className="text-blue-500" /> Cartes & Paiements
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Gerez les cartes bancaires et operateurs mobile money</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="cards" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <CreditCard size={16} className="mr-2" /> Cartes Bancaires ({bankCards.length})
          </TabsTrigger>
          <TabsTrigger value="operators" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Smartphone size={16} className="mr-2" /> Operateurs Mobile ({operators.length})
          </TabsTrigger>
        </TabsList>

        {/* Bank Cards Tab */}
        <TabsContent value="cards" className="mt-4 space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <Select value={cardFilter || "all"} onValueChange={(v) => setCardFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Tous les statuts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="pending">En attente</SelectItem>
                <SelectItem value="approved">Approuvees</SelectItem>
                <SelectItem value="rejected">Rejetees</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => { setCardFilter(''); setCardPage(1); fetchBankCards(); }}>
              <Search size={14} className="mr-2" /> Actualiser
            </Button>
          </div>

          {/* Cards List */}
          {bankCards.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <CreditCard size={48} className="mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">Aucune carte bancaire</p>
            </div>
          ) : (
            <div className="space-y-3">
              {bankCards.map((card) => (
                <div key={card.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-8 rounded flex items-center justify-center text-white font-bold text-xs ${card.card_type === 'visa' ? 'bg-blue-600' : 'bg-orange-600'}`}>
                        {card.card_type?.toUpperCase()}
                      </div>
                      <div>
                        <p className="font-mono text-foreground">{card.masked_number}</p>
                        <p className="text-sm text-muted-foreground">{card.holder_name}</p>
                        <p className="text-xs text-muted-foreground">Exp: {card.expiry_month}/{card.expiry_year}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="text-right mr-4">
                        <p className="text-sm text-foreground">{card.user_name}</p>
                        <p className="text-xs text-muted-foreground">{card.user_phone}</p>
                      </div>
                      
                      <Badge className={STATUS_CONFIG[card.status]?.color}>
                        {STATUS_CONFIG[card.status]?.label}
                      </Badge>
                      
                      {card.can_deposit && (
                        <Badge className="bg-green-500/20 text-green-400">
                          <ArrowDownToLine size={12} className="mr-1" /> Depot
                        </Badge>
                      )}
                      {card.can_withdraw && (
                        <Badge className="bg-purple-500/20 text-purple-400">
                          <ArrowUpFromLine size={12} className="mr-1" /> Retrait
                        </Badge>
                      )}
                      
                      <Button size="sm" variant="outline" onClick={() => setActionModal(card)} data-testid={`card-action-${card.id}`}>
                        <Settings size={14} className="mr-1" /> Actions
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Mobile Operators Tab */}
        <TabsContent value="operators" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { resetOperatorForm(); setShowOperatorModal(true); }} className="btn-primary-glow" data-testid="add-operator-btn">
              <Plus size={16} className="mr-2" /> Ajouter Operateur
            </Button>
          </div>

          {Object.keys(operatorsByCountry).length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <Smartphone size={48} className="mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">Aucun operateur configure</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(operatorsByCountry).map(([country, ops]) => (
                <div key={country} className="bg-card border border-border rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Globe size={18} className="text-primary" />
                    <h3 className="font-semibold text-foreground">{country}</h3>
                    <Badge variant="outline">{ops.length} operateur(s)</Badge>
                  </div>
                  
                  <div className="grid gap-3">
                    {ops.map((op) => (
                      <div key={op.operator_code} className="flex items-center justify-between bg-secondary/30 rounded-lg p-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${op.is_active ? 'bg-green-500/10' : 'bg-gray-500/10'}`}>
                            <Wifi size={18} className={op.is_active ? 'text-green-400' : 'text-gray-400'} />
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{op.operator_name}</p>
                            <p className="text-xs text-muted-foreground">{op.operator_code}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          <div className="text-right text-sm">
                            <p className="text-muted-foreground">Min: {op.min_amount} - Max: {op.max_amount}</p>
                            <p className="text-muted-foreground">Frais: {op.fee_percentage}% + {op.fee_fixed}</p>
                          </div>
                          
                          <Badge className={op.is_active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}>
                            {op.is_active ? 'Actif' : 'Inactif'}
                          </Badge>
                          
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => editOperator(op)}>
                              <Settings size={14} />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-red-400" onClick={() => handleDeleteOperator(op.operator_code)}>
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Card Action Modal */}
      {actionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md animate-scale-in">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              Actions sur la carte *{actionModal.last_4_digits}
            </h3>
            
            <div className="space-y-4">
              <div className="p-3 bg-secondary/30 rounded-lg">
                <p className="text-sm"><strong>Titulaire:</strong> {actionModal.holder_name}</p>
                <p className="text-sm"><strong>Type:</strong> {actionModal.card_type?.toUpperCase()}</p>
                <p className="text-sm"><strong>Statut:</strong> {STATUS_CONFIG[actionModal.status]?.label}</p>
              </div>
              
              <div className="space-y-2">
                <Label>Note (optionnel)</Label>
                <Textarea 
                  placeholder="Raison de l'action..." 
                  value={actionNote} 
                  onChange={(e) => setActionNote(e.target.value)}
                  rows={2}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                {actionModal.status === 'pending' && (
                  <>
                    <Button onClick={() => handleCardAction('approve')} disabled={actionLoading} className="bg-green-600 hover:bg-green-700">
                      <Check size={14} className="mr-1" /> Approuver
                    </Button>
                    <Button onClick={() => handleCardAction('reject')} disabled={actionLoading} variant="destructive">
                      <X size={14} className="mr-1" /> Rejeter
                    </Button>
                  </>
                )}
                
                {actionModal.status === 'approved' && (
                  <>
                    {!actionModal.can_withdraw ? (
                      <Button onClick={() => handleCardAction('enable_withdrawal')} disabled={actionLoading} className="bg-purple-600 hover:bg-purple-700">
                        <ArrowUpFromLine size={14} className="mr-1" /> Activer Retraits
                      </Button>
                    ) : (
                      <Button onClick={() => handleCardAction('disable_withdrawal')} disabled={actionLoading} variant="outline">
                        <Ban size={14} className="mr-1" /> Desactiver Retraits
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
            
            <Button variant="outline" className="w-full mt-4" onClick={() => { setActionModal(null); setActionNote(''); }}>
              Fermer
            </Button>
          </div>
        </div>
      )}

      {/* Operator Modal */}
      {showOperatorModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-2xl animate-scale-in my-8">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              {editingOperator ? 'Modifier' : 'Nouvel'} Operateur Mobile Money
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Code Pays *</Label>
                <Input 
                  placeholder="CD, CM, CI..." 
                  value={operatorForm.country_code}
                  onChange={(e) => setOperatorForm({...operatorForm, country_code: e.target.value.toUpperCase()})}
                  maxLength={3}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Code Operateur *</Label>
                <Input 
                  placeholder="ORANGE_CD, MTN_CM..."
                  value={operatorForm.operator_code}
                  onChange={(e) => setOperatorForm({...operatorForm, operator_code: e.target.value.toUpperCase()})}
                  disabled={!!editingOperator}
                />
              </div>
              
              <div className="space-y-2 col-span-2">
                <Label>Nom de l'Operateur *</Label>
                <Input 
                  placeholder="Orange Money, MTN MoMo..."
                  value={operatorForm.operator_name}
                  onChange={(e) => setOperatorForm({...operatorForm, operator_name: e.target.value})}
                />
              </div>
              
              <div className="space-y-2 col-span-2">
                <Label>URL de Base API</Label>
                <Input 
                  placeholder="https://api.operator.com/v1"
                  value={operatorForm.api_base_url}
                  onChange={(e) => setOperatorForm({...operatorForm, api_base_url: e.target.value})}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Cle API</Label>
                <Input 
                  placeholder="API Key"
                  value={operatorForm.api_key}
                  onChange={(e) => setOperatorForm({...operatorForm, api_key: e.target.value})}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Secret API</Label>
                <Input 
                  type="password"
                  placeholder="API Secret"
                  value={operatorForm.api_secret}
                  onChange={(e) => setOperatorForm({...operatorForm, api_secret: e.target.value})}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Endpoint Depot</Label>
                <Input 
                  placeholder="/deposit"
                  value={operatorForm.deposit_endpoint}
                  onChange={(e) => setOperatorForm({...operatorForm, deposit_endpoint: e.target.value})}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Endpoint Retrait</Label>
                <Input 
                  placeholder="/withdraw"
                  value={operatorForm.withdrawal_endpoint}
                  onChange={(e) => setOperatorForm({...operatorForm, withdrawal_endpoint: e.target.value})}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Montant Min</Label>
                <Input 
                  type="number"
                  value={operatorForm.min_amount}
                  onChange={(e) => setOperatorForm({...operatorForm, min_amount: parseFloat(e.target.value) || 0})}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Montant Max</Label>
                <Input 
                  type="number"
                  value={operatorForm.max_amount}
                  onChange={(e) => setOperatorForm({...operatorForm, max_amount: parseFloat(e.target.value) || 0})}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Frais (%)</Label>
                <Input 
                  type="number"
                  step="0.1"
                  value={operatorForm.fee_percentage}
                  onChange={(e) => setOperatorForm({...operatorForm, fee_percentage: parseFloat(e.target.value) || 0})}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Frais Fixes</Label>
                <Input 
                  type="number"
                  step="0.01"
                  value={operatorForm.fee_fixed}
                  onChange={(e) => setOperatorForm({...operatorForm, fee_fixed: parseFloat(e.target.value) || 0})}
                />
              </div>
              
              <div className="col-span-2 flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                <span className="text-sm text-foreground">Operateur Actif</span>
                <Button 
                  variant={operatorForm.is_active ? "default" : "outline"}
                  size="sm"
                  onClick={() => setOperatorForm({...operatorForm, is_active: !operatorForm.is_active})}
                >
                  {operatorForm.is_active ? 'Actif' : 'Inactif'}
                </Button>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => { setShowOperatorModal(false); resetOperatorForm(); }}>
                Annuler
              </Button>
              <Button className="flex-1 btn-primary-glow" onClick={handleSaveOperator} disabled={actionLoading}>
                {actionLoading ? <Loader2 size={16} className="mr-2 animate-spin" /> : null}
                Enregistrer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
