import { useState, useEffect, useCallback } from 'react';
import API from '../utils/api';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { 
  CreditCard, Plus, Lock, Unlock, Trash2, ArrowDownToLine, 
  ArrowUpFromLine, Edit2, Check, X, Wallet, QrCode, Send,
  Clock, CheckCircle, XCircle, RefreshCw, Smartphone
} from 'lucide-react';

const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', XAF: 'FCFA', XOF: 'FCFA', GBP: '£', CNY: '¥', CDF: 'FC', NGN: '₦', GHS: '₵', RUB: '₽', CAD: 'C$', MXN: '$' };

const STATUS_CONFIG = {
  pending: { label: 'En attente', color: 'bg-yellow-500/10 text-yellow-400', icon: Clock },
  approved: { label: 'Approuvée', color: 'bg-green-500/10 text-green-400', icon: CheckCircle },
  stopped: { label: 'Stoppée', color: 'bg-red-500/10 text-red-400', icon: XCircle },
  pending_deletion: { label: 'Suppression en cours', color: 'bg-orange-500/10 text-orange-400', icon: Trash2 }
};

const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Quotidien' },
  { value: 'weekly', label: 'Hebdomadaire' },
  { value: 'monthly', label: 'Mensuel' },
  { value: 'quarterly', label: 'Trimestriel' }
];

export default function VirtualCards() {
  const [cards, setCards] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showTransfer, setShowTransfer] = useState(null);
  const [showBarcodeSend, setShowBarcodeSend] = useState(null);
  const [editingCard, setEditingCard] = useState(null);
  
  // Form states
  const [newCard, setNewCard] = useState({
    name: '',
    currency: 'USD',
    limit: '1000',
    can_send: true,
    can_receive: true,
    auto_recharge: false,
    auto_recharge_amount: '',
    auto_recharge_frequency: 'monthly'
  });
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDirection, setTransferDirection] = useState('to');
  const [editName, setEditName] = useState('');
  const [receiverBarcode, setReceiverBarcode] = useState('');
  const [barcodeAmount, setBarcodeAmount] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [cardsRes, walletsRes] = await Promise.all([
        API.get('/virtual-cards'),
        API.get('/wallet/wallets')
      ]);
      setCards(cardsRes.data || []);
      setWallets(walletsRes.data || []);
    } catch (e) {
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const createCard = async () => {
    if (!newCard.name.trim()) {
      toast.error('Nom de carte requis');
      return;
    }
    try {
      const payload = {
        name: newCard.name.trim(),
        currency: newCard.currency,
        limit: parseFloat(newCard.limit) || 1000,
        can_send: newCard.can_send,
        can_receive: newCard.can_receive,
        auto_recharge: newCard.auto_recharge,
        auto_recharge_amount: newCard.auto_recharge ? parseFloat(newCard.auto_recharge_amount) || null : null,
        auto_recharge_frequency: newCard.auto_recharge ? newCard.auto_recharge_frequency : null
      };
      const res = await API.post('/virtual-cards', payload);
      toast.success(res.data.message);
      setShowCreate(false);
      setNewCard({
        name: '',
        currency: 'USD',
        limit: '1000',
        can_send: true,
        can_receive: true,
        auto_recharge: false,
        auto_recharge_amount: '',
        auto_recharge_frequency: 'monthly'
      });
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const toggleLock = async (card) => {
    try {
      await API.patch(`/virtual-cards/${card.id}`, { is_locked: !card.is_locked });
      toast.success(card.is_locked ? 'Carte déverrouillée' : 'Carte verrouillée');
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const requestDeleteCard = async (cardId) => {
    if (!window.confirm('Demander la suppression de cette carte ? Le solde sera remboursé et 3 administrateurs devront approuver.')) return;
    try {
      const res = await API.delete(`/virtual-cards/${cardId}`);
      toast.success(res.data.message);
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const handleTransfer = async (card) => {
    if (!transferAmount || parseFloat(transferAmount) <= 0) {
      toast.error('Montant invalide');
      return;
    }
    try {
      const endpoint = transferDirection === 'to' 
        ? `/virtual-cards/${card.id}/transfer`
        : `/virtual-cards/${card.id}/withdraw`;
      await API.post(endpoint, null, {
        params: { amount: parseFloat(transferAmount) }
      });
      toast.success('Transfert effectué !');
      setShowTransfer(null);
      setTransferAmount('');
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const handleBarcodeSend = async (card) => {
    if (!receiverBarcode.trim() || !barcodeAmount || parseFloat(barcodeAmount) <= 0) {
      toast.error('Code-barres et montant requis');
      return;
    }
    try {
      await API.post('/virtual-cards/barcode/send', null, {
        params: {
          sender_barcode: card.barcode,
          receiver_barcode: receiverBarcode.trim(),
          amount: parseFloat(barcodeAmount)
        }
      });
      toast.success('Transfert effectué !');
      setShowBarcodeSend(null);
      setReceiverBarcode('');
      setBarcodeAmount('');
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const saveCardName = async (card) => {
    if (!editName.trim()) {
      setEditingCard(null);
      return;
    }
    try {
      await API.patch(`/virtual-cards/${card.id}`, { name: editName.trim() });
      toast.success('Nom modifié');
      setEditingCard(null);
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const copyBarcode = (barcode) => {
    navigator.clipboard.writeText(barcode);
    toast.success('Code-barres copié !');
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="skeleton h-40 w-full rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Manrope' }}>Cartes Virtuelles</h1>
          <p className="text-sm text-muted-foreground">Sous-comptes avec code-barres</p>
        </div>
        <Button onClick={() => setShowCreate(true)} data-testid="create-card-btn">
          <Plus size={16} className="mr-2" />
          Nouvelle carte
        </Button>
      </div>

      {/* Create Card Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md animate-fade-in-up my-8" data-testid="create-card-modal">
            <h3 className="text-lg font-semibold text-foreground mb-4">Créer une carte virtuelle</h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground">Nom de la carte</label>
                <Input
                  placeholder="Ex: Carte enfant François"
                  value={newCard.name}
                  onChange={(e) => setNewCard({ ...newCard, name: e.target.value })}
                  className="mt-1"
                  data-testid="new-card-name"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-muted-foreground">Devise</label>
                  <select
                    value={newCard.currency}
                    onChange={(e) => setNewCard({ ...newCard, currency: e.target.value })}
                    className="w-full mt-1 bg-secondary border border-border rounded-lg px-3 py-2 text-foreground"
                  >
                    {wallets.map(w => (
                      <option key={w.currency} value={w.currency}>{w.currency}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Limite</label>
                  <Input
                    type="number"
                    placeholder="1000"
                    value={newCard.limit}
                    onChange={(e) => setNewCard({ ...newCard, limit: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>

              {/* Permissions */}
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Permissions</label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-2 cursor-pointer bg-secondary/50 rounded-lg p-3">
                    <input
                      type="checkbox"
                      checked={newCard.can_send}
                      onChange={(e) => setNewCard({ ...newCard, can_send: e.target.checked })}
                      className="rounded"
                    />
                    <Send size={14} className="text-muted-foreground" />
                    <span className="text-sm text-foreground">Peut envoyer</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer bg-secondary/50 rounded-lg p-3">
                    <input
                      type="checkbox"
                      checked={newCard.can_receive}
                      onChange={(e) => setNewCard({ ...newCard, can_receive: e.target.checked })}
                      className="rounded"
                    />
                    <ArrowDownToLine size={14} className="text-muted-foreground" />
                    <span className="text-sm text-foreground">Peut recevoir</span>
                  </label>
                </div>
              </div>

              {/* Auto Recharge */}
              <div className="bg-secondary/30 rounded-lg p-3 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newCard.auto_recharge}
                    onChange={(e) => setNewCard({ ...newCard, auto_recharge: e.target.checked })}
                    className="rounded"
                  />
                  <RefreshCw size={14} className="text-muted-foreground" />
                  <span className="text-sm text-foreground">Recharge automatique</span>
                </label>
                
                {newCard.auto_recharge && (
                  <div className="grid grid-cols-2 gap-3 pl-6">
                    <div>
                      <label className="text-xs text-muted-foreground">Montant</label>
                      <Input
                        type="number"
                        placeholder="50"
                        value={newCard.auto_recharge_amount}
                        onChange={(e) => setNewCard({ ...newCard, auto_recharge_amount: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Fréquence</label>
                      <select
                        value={newCard.auto_recharge_frequency}
                        onChange={(e) => setNewCard({ ...newCard, auto_recharge_frequency: e.target.value })}
                        className="w-full mt-1 bg-secondary border border-border rounded-lg px-3 py-2 text-foreground text-sm"
                      >
                        {FREQUENCY_OPTIONS.map(f => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 text-xs text-yellow-400">
                <Clock size={14} className="inline mr-1" />
                La carte devra être approuvée par un administrateur avant de pouvoir être utilisée.
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="ghost" className="flex-1" onClick={() => setShowCreate(false)}>
                Annuler
              </Button>
              <Button className="flex-1" onClick={createCard} data-testid="confirm-create-card">
                Créer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {showTransfer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md animate-fade-in-up">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              Transfert - {showTransfer.name}
            </h3>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setTransferDirection('to')}
                  className={`p-3 rounded-lg border ${transferDirection === 'to' ? 'border-primary bg-primary/10' : 'border-border'}`}
                >
                  <ArrowDownToLine size={20} className="mx-auto mb-1" />
                  <span className="text-sm">Vers carte</span>
                </button>
                <button
                  onClick={() => setTransferDirection('from')}
                  className={`p-3 rounded-lg border ${transferDirection === 'from' ? 'border-primary bg-primary/10' : 'border-border'}`}
                >
                  <ArrowUpFromLine size={20} className="mx-auto mb-1" />
                  <span className="text-sm">Depuis carte</span>
                </button>
              </div>

              <div>
                <label className="text-sm text-muted-foreground">Montant ({showTransfer.currency})</label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div className="bg-secondary/50 rounded-lg p-3 text-sm">
                {transferDirection === 'to' ? (
                  <p className="text-muted-foreground">
                    Portefeuille: {CURRENCY_SYMBOLS[showTransfer.currency]}
                    {wallets.find(w => w.currency === showTransfer.currency)?.balance.toLocaleString() || 0}
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    Solde carte: {CURRENCY_SYMBOLS[showTransfer.currency]}{showTransfer.balance.toLocaleString()}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="ghost" className="flex-1" onClick={() => { setShowTransfer(null); setTransferAmount(''); }}>
                Annuler
              </Button>
              <Button className="flex-1" onClick={() => handleTransfer(showTransfer)}>
                Transférer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Barcode Send Modal */}
      {showBarcodeSend && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md animate-fade-in-up">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              Envoyer par code-barres
            </h3>
            
            <div className="space-y-4">
              <div className="bg-secondary/50 rounded-lg p-3 text-sm">
                <p className="text-muted-foreground">Depuis: <span className="text-foreground font-medium">{showBarcodeSend.name}</span></p>
                <p className="text-muted-foreground font-mono text-xs mt-1">{showBarcodeSend.barcode}</p>
              </div>

              <div>
                <label className="text-sm text-muted-foreground">Code-barres destinataire</label>
                <Input
                  placeholder="MVC..."
                  value={receiverBarcode}
                  onChange={(e) => setReceiverBarcode(e.target.value.toUpperCase())}
                  className="mt-1 font-mono"
                />
              </div>

              <div>
                <label className="text-sm text-muted-foreground">Montant ({showBarcodeSend.currency})</label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={barcodeAmount}
                  onChange={(e) => setBarcodeAmount(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div className="bg-secondary/50 rounded-lg p-3 text-sm">
                <p className="text-muted-foreground">
                  Solde disponible: {CURRENCY_SYMBOLS[showBarcodeSend.currency]}{showBarcodeSend.balance.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="ghost" className="flex-1" onClick={() => { setShowBarcodeSend(null); setReceiverBarcode(''); setBarcodeAmount(''); }}>
                Annuler
              </Button>
              <Button className="flex-1" onClick={() => handleBarcodeSend(showBarcodeSend)}>
                Envoyer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Cards Grid */}
      {cards.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-12 text-center">
          <CreditCard size={48} className="mx-auto text-muted-foreground mb-3 opacity-50" />
          <h3 className="font-semibold text-foreground">Aucune carte virtuelle</h3>
          <p className="text-sm text-muted-foreground mt-1">Créez des sous-comptes avec code-barres</p>
          <Button className="mt-4" onClick={() => setShowCreate(true)}>
            <Plus size={16} className="mr-2" />
            Créer ma première carte
          </Button>
        </div>
      ) : (
        <div className="grid gap-4" data-testid="virtual-cards-list">
          {cards.map(card => {
            const StatusIcon = STATUS_CONFIG[card.status]?.icon || Clock;
            const isActive = card.status === 'approved' && !card.is_locked;
            
            return (
              <div 
                key={card.id} 
                className={`bg-gradient-to-br from-card to-secondary/30 border rounded-2xl p-5 ${
                  card.is_locked ? 'border-red-500/30 opacity-75' : 
                  card.status !== 'approved' ? 'border-yellow-500/30' : 'border-border'
                }`}
                data-testid={`virtual-card-${card.id}`}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      card.is_locked ? 'bg-red-500/10' : 
                      card.status !== 'approved' ? 'bg-yellow-500/10' : 
                      card.is_physical ? 'bg-blue-500/10' : 'bg-primary/10'
                    }`}>
                      {card.is_physical ? (
                        <Smartphone size={24} className="text-blue-400" />
                      ) : (
                        <CreditCard size={24} className={card.is_locked ? 'text-red-400' : card.status !== 'approved' ? 'text-yellow-400' : 'text-primary'} />
                      )}
                    </div>
                    <div>
                      {editingCard === card.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="h-8 w-40"
                            autoFocus
                          />
                          <button onClick={() => saveCardName(card)} className="text-green-500 hover:text-green-400">
                            <Check size={16} />
                          </button>
                          <button onClick={() => setEditingCard(null)} className="text-red-500 hover:text-red-400">
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-foreground">{card.name}</h3>
                          <button 
                            onClick={() => { setEditingCard(card.id); setEditName(card.name); }}
                            className="text-muted-foreground hover:text-primary"
                          >
                            <Edit2 size={12} />
                          </button>
                        </div>
                      )}
                      {/* Status Badge */}
                      <div className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full mt-1 ${STATUS_CONFIG[card.status]?.color}`}>
                        <StatusIcon size={10} />
                        {STATUS_CONFIG[card.status]?.label}
                        {card.is_physical && <span className="ml-1">• NFC</span>}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {card.status === 'approved' && (
                      <button
                        onClick={() => toggleLock(card)}
                        className={`p-2 rounded-lg ${card.is_locked ? 'bg-red-500/10 text-red-400' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
                      >
                        {card.is_locked ? <Lock size={16} /> : <Unlock size={16} />}
                      </button>
                    )}
                    {card.status !== 'pending_deletion' && (
                      <button
                        onClick={() => requestDeleteCard(card.id)}
                        className="p-2 rounded-lg bg-secondary text-muted-foreground hover:text-red-400"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Barcode */}
                <div className="bg-secondary/50 rounded-lg p-3 mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Code-barres</p>
                      <p className="font-mono text-sm text-foreground">{card.barcode}</p>
                    </div>
                    <button onClick={() => copyBarcode(card.barcode)} className="text-muted-foreground hover:text-primary">
                      <QrCode size={20} />
                    </button>
                  </div>
                  {card.nfc_code && (
                    <div className="mt-2 pt-2 border-t border-border">
                      <p className="text-xs text-muted-foreground">Code NFC</p>
                      <p className="font-mono text-xs text-blue-400">{card.nfc_code}</p>
                    </div>
                  )}
                </div>

                {/* Balance & Permissions */}
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Solde</p>
                    <p className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Manrope' }}>
                      {CURRENCY_SYMBOLS[card.currency]}{card.balance.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
                    </p>
                    <div className="flex gap-2 mt-2">
                      {card.can_send && <span className="text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded">Envoi</span>}
                      {card.can_receive && <span className="text-xs bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded">Réception</span>}
                      {card.auto_recharge && <span className="text-xs bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded">Auto</span>}
                    </div>
                  </div>
                  
                  {isActive && (
                    <div className="flex gap-2">
                      {card.can_send && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setShowBarcodeSend(card)}
                        >
                          <Send size={14} className="mr-1" />
                          Envoyer
                        </Button>
                      )}
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => { setShowTransfer(card); setTransferDirection('to'); }}
                      >
                        <Wallet size={14} className="mr-1" />
                        Gérer
                      </Button>
                    </div>
                  )}
                </div>

                {/* Auto Recharge Info */}
                {card.auto_recharge && (
                  <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
                    <RefreshCw size={12} className="inline mr-1" />
                    Recharge auto: {CURRENCY_SYMBOLS[card.currency]}{card.auto_recharge_amount} / {FREQUENCY_OPTIONS.find(f => f.value === card.auto_recharge_frequency)?.label.toLowerCase()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
