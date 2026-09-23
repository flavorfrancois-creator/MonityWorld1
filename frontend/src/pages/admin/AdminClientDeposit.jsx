import { useState, useCallback } from 'react';
import API from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import {
  Search, Banknote, User, Phone, MapPin, Wallet, Loader2,
  CheckCircle2, AlertTriangle, Globe
} from 'lucide-react';

export default function AdminClientDeposit() {
  const [search, setSearch] = useState('');
  const [clients, setClients] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [method, setMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [processing, setProcessing] = useState(false);
  const [lastDeposit, setLastDeposit] = useState(null);

  const searchClients = useCallback(async () => {
    if (!search.trim()) return;
    setSearching(true);
    try {
      const res = await API.get(`/admin/client-deposit/search?q=${encodeURIComponent(search)}`);
      setClients(res.data.clients || []);
      if (res.data.clients?.length === 0) {
        toast.info('Aucun client trouvé');
      }
    } catch (e) {
      const msg = e.response?.data?.detail || 'Erreur de recherche';
      toast.error(msg);
    } finally {
      setSearching(false);
    }
  }, [search]);

  const handleDeposit = async () => {
    if (!selectedClient || !amount || parseFloat(amount) <= 0) {
      toast.error('Veuillez sélectionner un client et entrer un montant valide');
      return;
    }
    setProcessing(true);
    try {
      const idempotencyKey = `deposit_${selectedClient.id}_${Date.now()}`;
      const res = await API.post('/admin/client-deposit', {
        client_phone: selectedClient.phone,
        amount: parseFloat(amount),
        currency,
        method,
        note: note || undefined,
        idempotency_key: idempotencyKey
      });
      toast.success(res.data.message);
      setLastDeposit(res.data);
      setAmount('');
      setNote('');
      setSelectedClient(null);
      setClients([]);
      setSearch('');
    } catch (e) {
      const msg = e.response?.data?.detail || 'Erreur lors du dépôt';
      toast.error(msg);
    } finally {
      setProcessing(false);
    }
  };

  const getWalletBalance = (client, cur) => {
    const w = client.wallets?.find(w => w.currency === cur);
    return w ? w.balance : null;
  };

  return (
    <div className="space-y-6" data-testid="admin-client-deposit-page">
      <div>
        <h1 className="text-2xl font-bold" data-testid="deposit-page-title">Dépôt Client</h1>
        <p className="text-muted-foreground text-sm mt-1">Effectuer un dépôt sur le compte d'un client de votre zone</p>
      </div>

      {lastDeposit && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4" data-testid="last-deposit-success">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
            <span className="font-semibold text-green-400">Dépôt réussi</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted-foreground">Client:</span>
            <span>{lastDeposit.client_name}</span>
            <span className="text-muted-foreground">Montant:</span>
            <span className="font-semibold">{lastDeposit.amount} {lastDeposit.currency}</span>
            <span className="text-muted-foreground">Nouveau solde:</span>
            <span>{lastDeposit.new_balance} {lastDeposit.currency}</span>
            <span className="text-muted-foreground">Transaction:</span>
            <span className="text-xs font-mono">{lastDeposit.transaction_id?.slice(0, 8)}...</span>
          </div>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setLastDeposit(null)}>
            Fermer
          </Button>
        </div>
      )}

      {/* Search */}
      <div className="bg-card border rounded-lg p-4 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Search className="w-4 h-4" /> Rechercher un client
        </h2>
        <div className="flex gap-2">
          <Input
            data-testid="client-search-input"
            placeholder="Téléphone, nom ou numéro de compte..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchClients()}
          />
          <Button
            data-testid="client-search-btn"
            onClick={searchClients}
            disabled={searching || !search.trim()}
          >
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </Button>
        </div>

        {/* Results */}
        {clients.length > 0 && (
          <div className="space-y-2 max-h-60 overflow-y-auto" data-testid="client-search-results">
            {clients.map(c => (
              <div
                key={c.id}
                data-testid={`client-result-${c.id}`}
                onClick={() => { setSelectedClient(c); setCurrency(c.wallets?.[0]?.currency || 'USD'); }}
                className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                  selectedClient?.id === c.id
                    ? 'border-primary bg-primary/5'
                    : 'hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {c.phone}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant="outline" className="text-xs">
                    <MapPin className="w-3 h-3 mr-1" /> {c.country}
                  </Badge>
                  {c.wallets?.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {c.wallets.map(w => `${w.balance} ${w.currency}`).join(' | ')}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Deposit Form */}
      {selectedClient && (
        <div className="bg-card border rounded-lg p-4 space-y-4" data-testid="deposit-form">
          <h2 className="font-semibold flex items-center gap-2">
            <Banknote className="w-4 h-4" /> Effectuer le dépôt
          </h2>

          <div className="bg-muted/30 rounded-lg p-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">{selectedClient.name}</p>
                <p className="text-xs text-muted-foreground">{selectedClient.phone} - {selectedClient.country}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Montant</label>
              <Input
                data-testid="deposit-amount-input"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Devise</label>
              <select
                data-testid="deposit-currency-select"
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {selectedClient.wallets?.map(w => (
                  <option key={w.currency} value={w.currency}>
                    {w.currency} (solde: {w.balance})
                  </option>
                ))}
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="XAF">XAF</option>
                <option value="CDF">CDF</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Méthode</label>
            <select
              data-testid="deposit-method-select"
              className="w-full h-10 rounded-md border bg-background px-3 text-sm"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="cash">Espèces</option>
              <option value="bank_transfer">Virement bancaire</option>
              <option value="mobile_money">Mobile Money</option>
              <option value="check">Chèque</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Note (optionnelle)</label>
            <Input
              data-testid="deposit-note-input"
              placeholder="Note ou référence..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {amount && parseFloat(amount) > 0 && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3" data-testid="deposit-preview">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Montant du dépôt</span>
                <span className="font-bold text-lg">{parseFloat(amount).toFixed(2)} {currency}</span>
              </div>
              {getWalletBalance(selectedClient, currency) !== null && (
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-muted-foreground">Solde actuel</span>
                  <span className="text-sm">{getWalletBalance(selectedClient, currency)} {currency}</span>
                </div>
              )}
              {getWalletBalance(selectedClient, currency) !== null && (
                <div className="flex items-center justify-between mt-1 border-t pt-1">
                  <span className="text-xs text-muted-foreground">Nouveau solde estimé</span>
                  <span className="text-sm font-semibold text-green-400">
                    {(getWalletBalance(selectedClient, currency) + parseFloat(amount)).toFixed(2)} {currency}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              data-testid="deposit-submit-btn"
              onClick={handleDeposit}
              disabled={processing || !amount || parseFloat(amount) <= 0}
              className="flex-1"
            >
              {processing ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Traitement...</>
              ) : (
                <><Banknote className="w-4 h-4 mr-2" /> Confirmer le dépôt</>
              )}
            </Button>
            <Button
              data-testid="deposit-cancel-btn"
              variant="outline"
              onClick={() => { setSelectedClient(null); setAmount(''); setNote(''); }}
            >
              Annuler
            </Button>
          </div>

          <div className="flex items-start gap-2 p-2 bg-yellow-500/5 border border-yellow-500/10 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              Ce dépôt sera crédité immédiatement sur le compte du client. 
              L'opération est tracée et ne peut pas être annulée.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
