import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import API from '../utils/api';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { 
  CreditCard, Lock, Unlock, Plus, Trash2, Wallet, RefreshCw, Eye, EyeOff, 
  ArrowRightLeft, AlertTriangle, Loader2, ArrowRight, Info
} from 'lucide-react';

const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', XAF: 'FCFA', XOF: 'FCFA', GBP: '£', CNY: '¥', CDF: 'FC', NGN: '₦', GHS: '₵', RUB: '₽' };

function VirtualCard({ card, onToggleLock, onDelete }) {
  return (
    <div className="virtual-card p-5 text-white relative" style={{minHeight: 160}}>
      <div className="flex justify-between items-start mb-6">
        <div>
          <p className="text-xs opacity-70">Monity World</p>
          <p className="text-sm font-bold opacity-90">{card.card_type === 'virtual' ? 'Carte Virtuelle' : 'Carte NFC'}</p>
        </div>
        <div className="w-10 h-7 rounded bg-yellow-400/80 opacity-80" />
      </div>
      <p className="text-base font-mono tracking-widest mb-4" data-testid="card-number">{card.card_number}</p>
      <div className="flex justify-between items-end">
        <div>
          <p className="text-xs opacity-60">Expiration</p>
          <p className="text-sm font-medium">{card.expiry_date}</p>
        </div>
        <div className="text-right">
          <p className="text-xs opacity-60">Limite</p>
          <p className="text-sm font-medium">${card.limit.toLocaleString()}</p>
        </div>
      </div>
      {card.is_locked && (
        <div className="absolute inset-0 bg-black/50 rounded-xl flex items-center justify-center">
          <div className="flex items-center gap-2 text-white"><Lock size={20} /><span className="font-semibold">Verrouillée</span></div>
        </div>
      )}
      <div className="absolute top-3 right-3 flex gap-2">
        <button onClick={() => onToggleLock(card.id)} className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors" data-testid={`card-lock-${card.id}`}>
          {card.is_locked ? <Unlock size={13} /> : <Lock size={13} />}
        </button>
        <button onClick={() => onDelete(card.id)} className="w-7 h-7 rounded-lg bg-red-500/20 hover:bg-red-500/30 flex items-center justify-center transition-colors" data-testid={`card-delete-${card.id}`}>
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

export default function WalletPage() {
  const { user } = useAuth();
  const [wallets, setWallets] = useState([]);
  const [cards, setCards] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addCardOpen, setAddCardOpen] = useState(false);
  const [addWalletOpen, setAddWalletOpen] = useState(false);
  const [showBalances, setShowBalances] = useState(true);
  const [newCardType, setNewCardType] = useState('virtual');
  const [newCurrency, setNewCurrency] = useState('');
  const [creating, setCreating] = useState(false);
  
  // Delete wallet modal
  const [deleteWalletOpen, setDeleteWalletOpen] = useState(false);
  const [walletToDelete, setWalletToDelete] = useState(null);
  const [convertTo, setConvertTo] = useState('');
  const [deleting, setDeleting] = useState(false);
  
  // Convert modal
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertFrom, setConvertFrom] = useState('');
  const [convertToCurrency, setConvertToCurrency] = useState('');
  const [convertAmount, setConvertAmount] = useState('');
  const [convertPreview, setConvertPreview] = useState(null);
  const [converting, setConverting] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  
  // Replace wallet modal (for 3rd wallet)
  const [replaceWalletOpen, setReplaceWalletOpen] = useState(false);
  const [replaceSource, setReplaceSource] = useState('');
  const [replaceTarget, setReplaceTarget] = useState('');
  const [replacePreview, setReplacePreview] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [wRes, cRes, curRes] = await Promise.all([
        API.get('/wallet/wallets'), 
        API.get('/cards'), 
        API.get('/currencies')
      ]);
      setWallets(wRes.data);
      setCards(cRes.data);
      setCurrencies(curRes.data);
    } catch (e) { 
      toast.error('Erreur de chargement'); 
    } finally { 
      setLoading(false); 
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Preview conversion
  const fetchConversionPreview = useCallback(async () => {
    if (!convertFrom || !convertToCurrency || !convertAmount || parseFloat(convertAmount) <= 0) {
      setConvertPreview(null);
      return;
    }
    
    setPreviewLoading(true);
    try {
      const res = await API.post('/wallet/conversion-preview', null, {
        params: {
          from_currency: convertFrom,
          to_currency: convertToCurrency,
          amount: parseFloat(convertAmount)
        }
      });
      setConvertPreview(res.data);
    } catch (e) {
      setConvertPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [convertFrom, convertToCurrency, convertAmount]);

  useEffect(() => {
    const timer = setTimeout(fetchConversionPreview, 500);
    return () => clearTimeout(timer);
  }, [fetchConversionPreview]);

  // Preview replace
  const fetchReplacePreview = useCallback(async () => {
    if (!replaceSource || !replaceTarget) {
      setReplacePreview(null);
      return;
    }
    
    const sourceWallet = wallets.find(w => w.currency === replaceSource);
    if (!sourceWallet || sourceWallet.balance <= 0) {
      setReplacePreview({ no_balance: true });
      return;
    }
    
    setPreviewLoading(true);
    try {
      const res = await API.post('/wallet/conversion-preview', null, {
        params: {
          from_currency: replaceSource,
          to_currency: replaceTarget,
          amount: sourceWallet.balance
        }
      });
      setReplacePreview(res.data);
    } catch (e) {
      setReplacePreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [replaceSource, replaceTarget, wallets]);

  useEffect(() => {
    const timer = setTimeout(fetchReplacePreview, 500);
    return () => clearTimeout(timer);
  }, [fetchReplacePreview]);

  const handleCreateCard = async () => {
    setCreating(true);
    try {
      await API.post('/cards', { card_type: newCardType, limit: 1000 });
      toast.success('Carte créée avec succès !');
      setAddCardOpen(false);
      fetchData();
    } catch (e) { 
      toast.error(e.response?.data?.detail || 'Erreur'); 
    } finally { 
      setCreating(false); 
    }
  };

  const handleAddWallet = async () => {
    if (!newCurrency) {
      toast.error('Sélectionnez une devise');
      return;
    }
    
    // If already 2 wallets, open replace modal
    if (wallets.length >= 2) {
      setReplaceTarget(newCurrency);
      setAddWalletOpen(false);
      setReplaceWalletOpen(true);
      return;
    }
    
    setCreating(true);
    try {
      await API.post('/wallet/wallets', { currency: newCurrency });
      toast.success(`Portefeuille ${newCurrency} créé !`);
      setAddWalletOpen(false);
      setNewCurrency('');
      fetchData();
    } catch (e) { 
      toast.error(e.response?.data?.detail || 'Erreur'); 
    } finally { 
      setCreating(false); 
    }
  };

  const handleDeleteWallet = async () => {
    if (!walletToDelete) return;
    
    const wallet = wallets.find(w => w.currency === walletToDelete);
    if (!wallet) return;
    
    // If wallet has balance, must convert
    if (wallet.balance > 0 && !convertTo) {
      toast.error('Sélectionnez une devise de destination pour la conversion');
      return;
    }
    
    setDeleting(true);
    try {
      if (wallet.balance > 0) {
        await API.post('/wallet/delete-with-conversion', {
          currency: walletToDelete,
          convert_to: convertTo
        });
        toast.success(`Portefeuille ${walletToDelete} supprimé. Solde converti en ${convertTo}.`);
      } else {
        await API.delete(`/wallet/wallets/${walletToDelete}`);
        toast.success(`Portefeuille ${walletToDelete} supprimé`);
      }
      setDeleteWalletOpen(false);
      setWalletToDelete(null);
      setConvertTo('');
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    } finally {
      setDeleting(false);
    }
  };

  const handleConvert = async () => {
    if (!convertFrom || !convertToCurrency || !convertAmount) {
      toast.error('Remplissez tous les champs');
      return;
    }
    
    setConverting(true);
    try {
      const res = await API.post('/wallet/convert', null, {
        params: {
          from_currency: convertFrom,
          to_currency: convertToCurrency,
          amount: parseFloat(convertAmount)
        }
      });
      toast.success(`Conversion effectuée: ${res.data.from_amount} ${res.data.from_currency} → ${res.data.to_amount} ${res.data.to_currency}`);
      setConvertOpen(false);
      setConvertFrom('');
      setConvertToCurrency('');
      setConvertAmount('');
      setConvertPreview(null);
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    } finally {
      setConverting(false);
    }
  };

  const handleReplaceWallet = async () => {
    if (!replaceSource || !replaceTarget) {
      toast.error('Sélectionnez les devises');
      return;
    }
    
    setConverting(true);
    try {
      const res = await API.post('/wallet/convert-and-replace', {
        source_currency: replaceSource,
        target_currency: replaceTarget,
        conversion_fee_percent: 1.5
      });
      toast.success(res.data.message);
      setReplaceWalletOpen(false);
      setReplaceSource('');
      setReplaceTarget('');
      setReplacePreview(null);
      setNewCurrency('');
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    } finally {
      setConverting(false);
    }
  };

  const handleToggleLock = async (cardId) => {
    try {
      const res = await API.patch(`/cards/${cardId}/lock`);
      toast.success(res.data.message);
      fetchData();
    } catch (e) { toast.error('Erreur'); }
  };

  const handleDeleteCard = async (cardId) => {
    if (!window.confirm('Supprimer cette carte ?')) return;
    try {
      await API.delete(`/cards/${cardId}`);
      toast.success('Carte supprimée');
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || 'Erreur'); }
  };

  const openDeleteModal = (currency) => {
    const wallet = wallets.find(w => w.currency === currency);
    if (wallet?.is_primary) {
      toast.error('Impossible de supprimer le portefeuille principal');
      return;
    }
    setWalletToDelete(currency);
    setConvertTo('');
    setDeleteWalletOpen(true);
  };

  if (loading) return <div className="p-6 space-y-4">{[1,2,3].map(i => <div key={i} className="skeleton h-24 w-full rounded-xl" />)}</div>;

  const existingCurrencies = wallets.map(w => w.currency);
  const availableCurrencies = currencies.filter(c => !existingCurrencies.includes(c.code));
  const nonPrimaryWallets = wallets.filter(w => !w.is_primary);

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between animate-fade-in-up">
        <h2 className="text-xl font-bold text-foreground" style={{fontFamily:'Manrope'}}>Portefeuille & Cartes</h2>
        <button onClick={() => setShowBalances(!showBalances)} className="text-muted-foreground hover:text-foreground transition-colors">
          {showBalances ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>

      {/* Wallets */}
      <div className="animate-fade-in-up stagger-1">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Wallet size={16} className="text-primary" />Portefeuilles 
            <Badge variant="outline" className="text-xs">{wallets.length}/2</Badge>
          </h3>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setConvertOpen(true)} data-testid="convert-btn">
              <ArrowRightLeft size={14} className="mr-1" /> Convertir
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAddWalletOpen(true)} data-testid="add-wallet-btn">
              <Plus size={14} className="mr-1" /> Ajouter
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {wallets.map(w => (
            <div key={w.id} className={`bg-card border rounded-xl p-4 relative group ${w.is_primary ? 'border-primary/40' : 'border-border'}`} data-testid={`wallet-${w.currency}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-foreground">{w.currency}</span>
                <div className="flex items-center gap-2">
                  {w.is_primary && <Badge className="text-xs bg-primary/10 text-primary border-0">Principal</Badge>}
                  {!w.is_primary && (
                    <button 
                      onClick={() => openDeleteModal(w.currency)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300"
                      data-testid={`delete-wallet-${w.currency}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xl font-bold text-foreground" style={{fontFamily:'Manrope'}}>
                {showBalances ? `${CURRENCY_SYMBOLS[w.currency] || ''}${w.balance.toLocaleString('fr-FR', {minimumFractionDigits: 2})}` : '•••••'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{currencies.find(c => c.code === w.currency)?.name || w.currency}</p>
            </div>
          ))}
        </div>
        
        {/* Info about max wallets */}
        {wallets.length >= 2 && (
          <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-sm text-blue-300 flex items-start gap-2">
            <Info size={16} className="mt-0.5 flex-shrink-0" />
            <p>Vous avez atteint le maximum de 2 portefeuilles. Pour ajouter une nouvelle devise, vous devez remplacer un portefeuille existant (le solde sera converti automatiquement).</p>
          </div>
        )}
      </div>

      {/* Cards */}
      <div className="animate-fade-in-up stagger-2">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-foreground flex items-center gap-2"><CreditCard size={16} className="text-blue-400" />Mes Cartes</h3>
          <Button size="sm" variant="outline" onClick={() => setAddCardOpen(true)} data-testid="add-card-btn">
            <Plus size={14} className="mr-1" /> Créer
          </Button>
        </div>
        {cards.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <CreditCard size={32} className="text-muted-foreground mx-auto mb-2 opacity-50" />
            <p className="text-muted-foreground text-sm">Aucune carte. Créez votre première carte virtuelle.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {cards.map(card => <VirtualCard key={card.id} card={card} onToggleLock={handleToggleLock} onDelete={handleDeleteCard} />)}
          </div>
        )}
      </div>

      {/* Currency Rates */}
      <div className="animate-fade-in-up stagger-3">
        <h3 className="font-semibold text-foreground flex items-center gap-2 mb-3"><RefreshCw size={16} className="text-purple-400" />Taux de change</h3>
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-3 px-4 py-2 border-b border-border text-xs text-muted-foreground font-medium">
            <span>Devise</span><span>Nom</span><span className="text-right">1 USD =</span>
          </div>
          {currencies.slice(0, 8).map(c => (
            <div key={c.code} className="grid grid-cols-3 px-4 py-2.5 border-b border-border last:border-0 text-sm hover:bg-secondary/20 transition-colors">
              <span className="font-medium text-foreground">{c.symbol} {c.code}</span>
              <span className="text-muted-foreground truncate">{c.name}</span>
              <span className="text-right text-foreground font-mono">{c.rate_to_usd}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Add Card Dialog */}
      <Dialog open={addCardOpen} onOpenChange={setAddCardOpen}>
        <DialogContent className="bg-card border-border sm:max-w-sm">
          <DialogHeader><DialogTitle style={{fontFamily:'Manrope'}}>Créer une nouvelle carte</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Type de carte</Label>
              <Select value={newCardType} onValueChange={setNewCardType}>
                <SelectTrigger className="h-11" data-testid="card-type-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="virtual">Carte Virtuelle</SelectItem>
                  <SelectItem value="nfc">Carte NFC</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setAddCardOpen(false)}>Annuler</Button>
              <Button className="flex-1 btn-primary-glow" onClick={handleCreateCard} disabled={creating} data-testid="create-card-submit-btn">
                {creating ? 'Création...' : 'Créer la carte'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Wallet Dialog */}
      <Dialog open={addWalletOpen} onOpenChange={setAddWalletOpen}>
        <DialogContent className="bg-card border-border sm:max-w-sm">
          <DialogHeader>
            <DialogTitle style={{fontFamily:'Manrope'}}>
              {wallets.length >= 2 ? 'Remplacer un portefeuille' : 'Ajouter un portefeuille'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {wallets.length >= 2 && (
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-300 flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                <p>Vous avez déjà 2 portefeuilles. Un portefeuille existant sera remplacé (avec conversion du solde).</p>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Nouvelle devise</Label>
              <Select value={newCurrency} onValueChange={setNewCurrency}>
                <SelectTrigger className="h-11" data-testid="wallet-currency-select"><SelectValue placeholder="Sélectionnez une devise" /></SelectTrigger>
                <SelectContent>
                  {availableCurrencies.map(c => <SelectItem key={c.code} value={c.code}>{c.code} – {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setAddWalletOpen(false)}>Annuler</Button>
              <Button className="flex-1 btn-primary-glow" onClick={handleAddWallet} disabled={creating || !newCurrency} data-testid="add-wallet-submit-btn">
                {creating ? 'Ajout...' : wallets.length >= 2 ? 'Suivant' : 'Ajouter'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Wallet Dialog */}
      <Dialog open={deleteWalletOpen} onOpenChange={setDeleteWalletOpen}>
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle style={{fontFamily:'Manrope'}} className="flex items-center gap-2">
              <Trash2 className="text-red-400" size={20} /> Supprimer le portefeuille {walletToDelete}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {walletToDelete && wallets.find(w => w.currency === walletToDelete)?.balance > 0 ? (
              <>
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-300 flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                  <p>Ce portefeuille contient <strong>{CURRENCY_SYMBOLS[walletToDelete]}{wallets.find(w => w.currency === walletToDelete)?.balance.toLocaleString('fr-FR', {minimumFractionDigits: 2})}</strong>. Le solde sera converti dans un autre portefeuille (frais: 1.5%).</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Convertir le solde vers</Label>
                  <Select value={convertTo} onValueChange={setConvertTo}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="Sélectionnez la destination" /></SelectTrigger>
                    <SelectContent>
                      {wallets.filter(w => w.currency !== walletToDelete).map(w => (
                        <SelectItem key={w.currency} value={w.currency}>{w.currency} – Solde: {CURRENCY_SYMBOLS[w.currency]}{w.balance.toFixed(2)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">Ce portefeuille est vide et sera supprimé définitivement.</p>
            )}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteWalletOpen(false)}>Annuler</Button>
              <Button 
                variant="destructive" 
                className="flex-1" 
                onClick={handleDeleteWallet} 
                disabled={deleting || (wallets.find(w => w.currency === walletToDelete)?.balance > 0 && !convertTo)}
              >
                {deleting ? <Loader2 size={16} className="mr-2 animate-spin" /> : null}
                Supprimer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Convert Dialog */}
      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle style={{fontFamily:'Manrope'}} className="flex items-center gap-2">
              <ArrowRightLeft className="text-purple-400" size={20} /> Convertir des devises
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">De</Label>
                <Select value={convertFrom} onValueChange={setConvertFrom}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Devise" /></SelectTrigger>
                  <SelectContent>
                    {wallets.filter(w => w.balance > 0).map(w => (
                      <SelectItem key={w.currency} value={w.currency}>{w.currency} ({CURRENCY_SYMBOLS[w.currency]}{w.balance.toFixed(2)})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Vers</Label>
                <Select value={convertToCurrency} onValueChange={setConvertToCurrency}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Devise" /></SelectTrigger>
                  <SelectContent>
                    {wallets.filter(w => w.currency !== convertFrom).map(w => (
                      <SelectItem key={w.currency} value={w.currency}>{w.currency}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Montant à convertir</Label>
              <Input 
                type="number" 
                placeholder="0.00" 
                value={convertAmount}
                onChange={(e) => setConvertAmount(e.target.value)}
                className="h-11"
              />
              {convertFrom && (
                <p className="text-xs text-muted-foreground">
                  Disponible: {CURRENCY_SYMBOLS[convertFrom]}{wallets.find(w => w.currency === convertFrom)?.balance.toFixed(2)}
                </p>
              )}
            </div>
            
            {/* Preview */}
            {convertPreview && (
              <div className="p-4 bg-secondary/30 rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Taux de change:</span>
                  <span className="text-foreground">{convertPreview.rate_info}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Montant brut:</span>
                  <span className="text-foreground">{CURRENCY_SYMBOLS[convertToCurrency]}{convertPreview.gross_amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm text-yellow-400">
                  <span>Frais ({convertPreview.fee_percent}%):</span>
                  <span>-{CURRENCY_SYMBOLS[convertToCurrency]}{convertPreview.fee_amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold pt-2 border-t border-border">
                  <span className="text-foreground">Vous recevrez:</span>
                  <span className="text-primary">{CURRENCY_SYMBOLS[convertToCurrency]}{convertPreview.net_amount.toFixed(2)}</span>
                </div>
              </div>
            )}
            
            {previewLoading && (
              <div className="flex items-center justify-center p-4">
                <Loader2 size={20} className="animate-spin text-primary" />
              </div>
            )}
            
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setConvertOpen(false)}>Annuler</Button>
              <Button 
                className="flex-1 btn-primary-glow" 
                onClick={handleConvert} 
                disabled={converting || !convertPreview}
              >
                {converting ? <Loader2 size={16} className="mr-2 animate-spin" /> : null}
                Convertir
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Replace Wallet Dialog (for 3rd wallet) */}
      <Dialog open={replaceWalletOpen} onOpenChange={setReplaceWalletOpen}>
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle style={{fontFamily:'Manrope'}} className="flex items-center gap-2">
              <ArrowRightLeft className="text-primary" size={20} /> Remplacer un portefeuille
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-sm text-blue-300">
              <p>Vous avez 2 portefeuilles. Pour créer <strong>{replaceTarget}</strong>, vous devez remplacer un portefeuille existant. Son solde sera automatiquement converti.</p>
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Portefeuille à remplacer</Label>
              <Select value={replaceSource} onValueChange={setReplaceSource}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Sélectionnez un portefeuille" /></SelectTrigger>
                <SelectContent>
                  {nonPrimaryWallets.map(w => (
                    <SelectItem key={w.currency} value={w.currency}>
                      {w.currency} – Solde: {CURRENCY_SYMBOLS[w.currency]}{w.balance.toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Preview */}
            {replaceSource && replacePreview && !replacePreview.no_balance && (
              <div className="p-4 bg-secondary/30 rounded-lg space-y-3">
                <div className="flex items-center justify-center gap-3 text-sm">
                  <div className="text-center">
                    <p className="text-muted-foreground">De</p>
                    <p className="font-bold text-lg text-foreground">{replaceSource}</p>
                    <p className="text-foreground">{CURRENCY_SYMBOLS[replaceSource]}{replacePreview.from_amount.toFixed(2)}</p>
                  </div>
                  <ArrowRight className="text-primary" size={24} />
                  <div className="text-center">
                    <p className="text-muted-foreground">Vers</p>
                    <p className="font-bold text-lg text-foreground">{replaceTarget}</p>
                    <p className="text-primary font-semibold">{CURRENCY_SYMBOLS[replaceTarget] || ''}{replacePreview.net_amount.toFixed(2)}</p>
                  </div>
                </div>
                <div className="text-center text-sm text-yellow-400">
                  Frais de conversion: {replacePreview.fee_percent}% ({CURRENCY_SYMBOLS[replaceTarget] || ''}{replacePreview.fee_amount.toFixed(2)})
                </div>
              </div>
            )}
            
            {replaceSource && replacePreview?.no_balance && (
              <div className="p-4 bg-secondary/30 rounded-lg text-center text-sm text-muted-foreground">
                <p>Le portefeuille {replaceSource} est vide. Il sera remplacé sans conversion.</p>
              </div>
            )}
            
            {previewLoading && (
              <div className="flex items-center justify-center p-4">
                <Loader2 size={20} className="animate-spin text-primary" />
              </div>
            )}
            
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => { setReplaceWalletOpen(false); setReplaceSource(''); setReplacePreview(null); }}>
                Annuler
              </Button>
              <Button 
                className="flex-1 btn-primary-glow" 
                onClick={handleReplaceWallet} 
                disabled={converting || !replaceSource}
              >
                {converting ? <Loader2 size={16} className="mr-2 animate-spin" /> : null}
                Remplacer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
