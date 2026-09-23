import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../utils/api';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import { 
  ArrowRight, Send, Plus, Download, CheckCircle2, User, Phone, DollarSign, 
  FileText, ArrowLeft, Loader2, Wallet, RefreshCw, ArrowRightLeft, AlertCircle,
  ArrowDownRight
} from 'lucide-react';

const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', XAF: 'FCFA', XOF: 'FCFA', GBP: '£', CNY: '¥', CDF: 'FC', NGN: '₦', GHS: '₵', RUB: '₽', MGA: 'Ar' };

function StepIndicator({ step, total }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i < step ? 'bg-primary' : i === step ? 'bg-primary w-6' : 'bg-secondary'}`} style={{ width: i === step ? 24 : 16 }} />
      ))}
    </div>
  );
}

function SendMoneyFlow({ currencies, wallets, user }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [result, setResult] = useState(null);
  
  // Get default currency from wallets or fallback to USD
  const defaultCurrency = wallets.length > 0 ? wallets[0].currency : 'USD';
  
  const [form, setForm] = useState({ 
    receiver_phone: '', 
    receiver_account: '', 
    amount: '', 
    currency: defaultCurrency,  // Source wallet currency
    target_currency: '',  // Target currency (empty = same as source)
    description: '', 
    method: 'phone' 
  });
  const [preview, setPreview] = useState(null);
  const [receiverInfo, setReceiverInfo] = useState(null);

  // Get selected source wallet
  const sourceWallet = wallets.find(w => w.currency === form.currency);
  
  // If no wallets, show message
  if (wallets.length === 0) {
    return (
      <div className="text-center py-8 space-y-4 animate-fade-in-up">
        <div className="w-16 h-16 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto">
          <Wallet size={32} className="text-yellow-400" />
        </div>
        <h3 className="text-xl font-bold text-foreground" style={{fontFamily:'Manrope'}}>Aucun portefeuille</h3>
        <p className="text-sm text-muted-foreground">Vous n'avez pas encore de portefeuille. Rechargez d'abord votre compte.</p>
        <Button className="btn-primary-glow" onClick={() => navigate('/send?tab=recharge')}>
          <Plus size={16} className="mr-2" /> Recharger
        </Button>
      </div>
    );
  }
  
  // Available target currencies (all available currencies)
  const availableCurrencies = currencies.map(c => c.code);
  
  // Determine if conversion is needed
  const targetCurrency = form.target_currency || form.currency;
  const isConversion = form.currency !== targetCurrency;

  // Fetch transfer preview with conversion info
  const fetchPreview = async () => {
    const receiver = form.method === 'phone' ? form.receiver_phone : form.receiver_account;
    if (!receiver) { toast.error('Entrez un destinataire'); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error('Montant invalide'); return; }
    
    setLoadingPreview(true);
    try {
      const payload = {
        amount: parseFloat(form.amount),
        currency: form.currency,
        target_currency: targetCurrency !== form.currency ? targetCurrency : null,
        description: form.description,
      };
      if (form.method === 'phone') payload.receiver_phone = form.receiver_phone;
      else payload.receiver_account = form.receiver_account;

      const res = await API.post('/wallet/transfer/preview', payload);
      setPreview(res.data);
      setReceiverInfo(res.data.receiver);
      
      if (!res.data.has_sufficient_balance) {
        toast.error('Solde insuffisant pour ce transfert');
      } else {
        setStep(2);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur lors de la prévisualisation');
    } finally { 
      setLoadingPreview(false); 
    }
  };

  const handleSend = async () => {
    setLoading(true);
    try {
      const payload = {
        amount: parseFloat(form.amount),
        currency: form.currency,
        target_currency: targetCurrency !== form.currency ? targetCurrency : null,
        description: form.description,
      };
      if (form.method === 'phone') payload.receiver_phone = form.receiver_phone;
      else payload.receiver_account = form.receiver_account;

      const res = await API.post('/wallet/transfer', payload);
      setResult(res.data);
      setStep(3);
      toast.success(res.data.message);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur lors du transfert');
    } finally { setLoading(false); }
  };

  // Success screen
  if (step === 3) return (
    <div className="text-center py-8 space-y-4 animate-fade-in-up">
      <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
        <CheckCircle2 size={32} className="text-primary" />
      </div>
      <h3 className="text-xl font-bold text-foreground" style={{fontFamily:'Manrope'}}>{result?.status === 'completed' ? 'Transfert réussi !' : 'Transfert soumis !'}</h3>
      <p className="text-muted-foreground text-sm">{result?.message}</p>
      <div className="bg-secondary/50 rounded-xl p-4 text-left space-y-2">
        <div className="flex justify-between"><span className="text-muted-foreground text-sm">Destinataire</span><span className="text-sm font-medium text-foreground">{result?.receiver}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground text-sm">Montant envoyé</span><span className="text-sm font-medium text-foreground">{result?.amount} {result?.source_currency}</span></div>
        {result?.is_conversion && (
          <>
            <div className="flex justify-between"><span className="text-muted-foreground text-sm">Taux de change</span><span className="text-sm text-foreground">1 {result?.source_currency} = {result?.exchange_rate?.toFixed(4)} {result?.received_currency}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground text-sm">Frais de conversion (2%)</span><span className="text-sm text-muted-foreground">{result?.conversion_fee} {result?.source_currency}</span></div>
          </>
        )}
        <div className="flex justify-between"><span className="text-muted-foreground text-sm">Frais de transfert</span><span className="text-sm text-muted-foreground">{result?.fee} {result?.source_currency}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground text-sm">Montant reçu</span><span className="text-sm font-medium text-primary">{result?.received_amount} {result?.received_currency}</span></div>
        <div className="flex justify-between border-t border-border pt-2"><span className="text-sm font-semibold text-foreground">Total débité</span><span className="text-sm font-semibold text-foreground">{result?.total_debited} {result?.source_currency}</span></div>
        <div className="flex justify-between"><span className="text-sm font-semibold text-foreground">Statut</span><span className={`text-sm font-medium ${result?.status === 'completed' ? 'text-green-400' : 'text-yellow-400'}`}>{result?.status === 'completed' ? 'Complété' : 'En attente de validation'}</span></div>
      </div>
      <div className="flex gap-3 mt-4">
        <Button variant="outline" className="flex-1" onClick={() => { setStep(0); setForm({ receiver_phone: '', receiver_account: '', amount: '', currency: wallets[0]?.currency || 'USD', target_currency: '', description: '', method: 'phone' }); setPreview(null); }}>Nouveau transfert</Button>
        <Button className="flex-1 btn-primary-glow" onClick={() => navigate('/history')}>Voir historique</Button>
      </div>
    </div>
  );

  return (
    <div>
      <StepIndicator step={step} total={3} />
      
      {/* Step 0: Receiver Selection */}
      {step === 0 && (
        <div className="space-y-4 animate-fade-in-up">
          <h3 className="font-semibold text-foreground" style={{fontFamily:'Manrope'}}>Destinataire</h3>
          <Tabs value={form.method} onValueChange={v => setForm({...form, method: v})}>
            <TabsList className="w-full bg-secondary/50">
              <TabsTrigger value="phone" className="flex-1 text-xs">Par téléphone</TabsTrigger>
              <TabsTrigger value="account" className="flex-1 text-xs">Par N° compte</TabsTrigger>
            </TabsList>
            <TabsContent value="phone" className="mt-4">
              <div className="relative">
                <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={form.receiver_phone} onChange={e => setForm({...form, receiver_phone: e.target.value})} placeholder="+243 XXX XXX XXX" className="pl-10 h-11" data-testid="send-phone-input" />
              </div>
            </TabsContent>
            <TabsContent value="account" className="mt-4">
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={form.receiver_account} onChange={e => setForm({...form, receiver_account: e.target.value})} placeholder="N° de compte" className="pl-10 h-11" data-testid="send-account-input" />
              </div>
            </TabsContent>
          </Tabs>
          <Button className="w-full h-11 btn-primary-glow" onClick={() => { const t2 = form.method === 'phone' ? form.receiver_phone : form.receiver_account; if (!t2) { toast.error('Entrez un destinataire'); return; } setStep(1); }} data-testid="send-next-step1-btn">
            Continuer <ArrowRight size={16} className="ml-2" />
          </Button>
        </div>
      )}

      {/* Step 1: Amount & Wallet Selection */}
      {step === 1 && (
        <div className="space-y-4 animate-fade-in-up">
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => setStep(0)} className="text-muted-foreground hover:text-foreground"><ArrowLeft size={18} /></button>
            <h3 className="font-semibold text-foreground" style={{fontFamily:'Manrope'}}>Montant & Portefeuille</h3>
          </div>
          
          {/* Source Wallet Selection */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Wallet size={12} /> Portefeuille source
            </Label>
            <Select value={form.currency} onValueChange={v => setForm({...form, currency: v, target_currency: ''})}>
              <SelectTrigger className="h-12" data-testid="send-source-wallet-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {wallets.map(w => (
                  <SelectItem key={w.currency} value={w.currency}>
                    <div className="flex items-center justify-between w-full gap-4">
                      <span className="font-medium">{w.currency}</span>
                      <span className="text-muted-foreground">
                        {CURRENCY_SYMBOLS[w.currency]}{w.balance.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {sourceWallet && (
              <p className="text-xs text-muted-foreground">
                Solde disponible: <span className="text-foreground font-medium">{CURRENCY_SYMBOLS[form.currency]}{sourceWallet.balance.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</span>
              </p>
            )}
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Montant à envoyer</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">{CURRENCY_SYMBOLS[form.currency]}</span>
              <Input 
                type="number" 
                value={form.amount} 
                onChange={e => setForm({...form, amount: e.target.value})} 
                placeholder="0.00" 
                className="pl-12 h-12 text-lg font-semibold" 
                min="0" 
                data-testid="send-amount-input" 
              />
            </div>
          </div>

          {/* Target Currency Selection (for conversion) */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <ArrowRightLeft size={12} /> Devise de réception
            </Label>
            <Select value={targetCurrency} onValueChange={v => setForm({...form, target_currency: v === form.currency ? '' : v})}>
              <SelectTrigger className="h-11" data-testid="send-target-currency-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currencies.map(c => (
                  <SelectItem key={c.code} value={c.code}>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.code}</span>
                      <span className="text-muted-foreground text-xs">– {c.name}</span>
                      {c.code === form.currency && <Badge variant="outline" className="text-xs ml-2">Source</Badge>}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Conversion Warning */}
          {isConversion && (
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle size={16} className="text-orange-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-orange-400 font-medium">Conversion de devise</p>
                <p className="text-xs text-orange-400/80">
                  Des frais de conversion de 2% seront appliqués car vous envoyez en {form.currency} et le destinataire recevra en {targetCurrency}.
                </p>
              </div>
            </div>
          )}

          {/* Description */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Description (optionnel)</Label>
            <div className="relative">
              <FileText size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Ex: Loyer, Course..." className="pl-10 h-11" data-testid="send-description-input" />
            </div>
          </div>

          <Button 
            className="w-full h-11 btn-primary-glow" 
            onClick={fetchPreview} 
            disabled={!form.amount || parseFloat(form.amount) <= 0 || loadingPreview} 
            data-testid="send-next-step2-btn"
          >
            {loadingPreview ? (
              <><Loader2 size={16} className="animate-spin mr-2" />Calcul des frais...</>
            ) : (
              <>Aperçu <ArrowRight size={16} className="ml-2" /></>
            )}
          </Button>
        </div>
      )}

      {/* Step 2: Confirmation */}
      {step === 2 && preview && (
        <div className="space-y-4 animate-fade-in-up">
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => setStep(1)} className="text-muted-foreground hover:text-foreground"><ArrowLeft size={18} /></button>
            <h3 className="font-semibold text-foreground" style={{fontFamily:'Manrope'}}>Confirmation</h3>
          </div>
          
          <div className="bg-secondary/30 rounded-xl p-5 space-y-4">
            {/* Amount Display */}
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">Vous envoyez</p>
              <p className="text-3xl font-bold text-foreground" style={{fontFamily:'Manrope'}}>
                {CURRENCY_SYMBOLS[form.currency]}{form.amount}
                <span className="text-lg text-muted-foreground ml-1">{form.currency}</span>
              </p>
            </div>

            {/* Conversion Arrow */}
            {preview.transfer.is_conversion && (
              <div className="flex items-center justify-center gap-2 py-2">
                <ArrowDownRight size={20} className="text-primary" />
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Taux: 1 {preview.transfer.source_currency} = {preview.transfer.exchange_rate.toFixed(4)} {preview.transfer.target_currency}</p>
                </div>
              </div>
            )}

            {/* Received Amount */}
            <div className="text-center bg-primary/10 rounded-lg py-3">
              <p className="text-sm text-muted-foreground mb-1">Le destinataire recevra</p>
              <p className="text-2xl font-bold text-primary" style={{fontFamily:'Manrope'}}>
                {CURRENCY_SYMBOLS[preview.transfer.target_currency]}{preview.transfer.received_amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
                <span className="text-sm ml-1">{preview.transfer.target_currency}</span>
              </p>
            </div>

            {/* Details */}
            <div className="space-y-2 text-sm pt-2 border-t border-border">
              <div className="flex justify-between">
                <span className="text-muted-foreground">De</span>
                <span className="text-foreground font-medium">{preview.sender.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">À</span>
                <span className="text-foreground font-medium">{preview.receiver.name} ({preview.receiver.phone})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Description</span>
                <span className="text-foreground">{form.description || '—'}</span>
              </div>
            </div>

            {/* Fees Breakdown */}
            <div className="space-y-2 text-sm pt-2 border-t border-border">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Montant</span>
                <span className="text-foreground">{form.amount} {form.currency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Frais de transfert</span>
                <span className="text-muted-foreground">{preview.transfer.transfer_fee} {form.currency}</span>
              </div>
              {preview.transfer.is_conversion && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Frais de conversion ({preview.transfer.conversion_fee_percent}%)</span>
                  <span className="text-orange-400">{preview.transfer.conversion_fee} {form.currency}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold border-t border-border pt-2">
                <span className="text-foreground">Total à débiter</span>
                <span className="text-foreground">{preview.transfer.total_debit} {form.currency}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Solde après transfert</span>
                <span className="text-muted-foreground">{CURRENCY_SYMBOLS[form.currency]}{preview.balance_after?.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>Modifier</Button>
            <Button className="flex-1 btn-primary-glow" onClick={handleSend} disabled={loading || !preview.has_sufficient_balance} data-testid="send-confirm-btn">
              {loading ? <><Loader2 size={16} className="animate-spin mr-2" />Envoi...</> : <><Send size={16} className="mr-2" />Confirmer</>}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function RechargeFlow({ currencies, user }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({ amount: '', currency: 'USD', method: 'mobile_money' });

  const handleRecharge = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error('Montant invalide'); return; }
    setLoading(true);
    try {
      await API.post('/wallet/recharge', { amount: parseFloat(form.amount), currency: form.currency, method: form.method });
      setDone(true);
      toast.success('Rechargement soumis. En attente de validation admin.');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    } finally { setLoading(false); }
  };

  if (done) return (
    <div className="text-center py-8 space-y-4 animate-fade-in-up">
      <div className="w-16 h-16 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto">
        <CheckCircle2 size={32} className="text-yellow-400" />
      </div>
      <h3 className="text-xl font-bold text-foreground">Rechargement soumis</h3>
      <p className="text-sm text-muted-foreground">Votre rechargement de {form.amount} {form.currency} est en attente de validation.</p>
      <Button className="btn-primary-glow" onClick={() => setDone(false)}>Nouveau rechargement</Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-foreground" style={{fontFamily:'Manrope'}}>Recharger mon portefeuille</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Montant</Label>
          <Input type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} placeholder="0.00" className="h-11" min="0" data-testid="recharge-amount-input" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Devise</Label>
          <Select value={form.currency} onValueChange={v => setForm({...form, currency: v})}>
            <SelectTrigger className="h-11" data-testid="recharge-currency-select"><SelectValue /></SelectTrigger>
            <SelectContent>{currencies.map(c => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Méthode</Label>
        <Select value={form.method} onValueChange={v => setForm({...form, method: v})}>
          <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="mobile_money">Mobile Money</SelectItem>
            <SelectItem value="bank_transfer">Virement Bancaire</SelectItem>
            <SelectItem value="card">Carte Bancaire</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button className="w-full h-11 btn-primary-glow" onClick={handleRecharge} disabled={loading} data-testid="recharge-submit-btn">
        {loading ? <Loader2 size={16} className="animate-spin mr-2" /> : <Plus size={16} className="mr-2" />}
        Recharger
      </Button>
    </div>
  );
}

function WithdrawFlow({ currencies, wallets }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({ amount: '', currency: 'USD', method: 'mobile_money', destination: '' });

  const wallet = wallets.find(w => w.currency === form.currency);

  const handleWithdraw = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error('Montant invalide'); return; }
    if (!form.destination) { toast.error('Entrez une destination'); return; }
    setLoading(true);
    try {
      await API.post('/wallet/withdraw', { amount: parseFloat(form.amount), currency: form.currency, method: form.method, destination: form.destination });
      setDone(true);
      toast.success('Retrait soumis. En attente de validation admin.');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    } finally { setLoading(false); }
  };

  if (done) return (
    <div className="text-center py-8 space-y-4 animate-fade-in-up">
      <div className="w-16 h-16 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto">
        <CheckCircle2 size={32} className="text-yellow-400" />
      </div>
      <h3 className="text-xl font-bold text-foreground">Retrait soumis</h3>
      <p className="text-sm text-muted-foreground">Votre retrait de {form.amount} {form.currency} est en attente de validation.</p>
      <Button className="btn-primary-glow" onClick={() => setDone(false)}>Nouveau retrait</Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-foreground" style={{fontFamily:'Manrope'}}>Retirer vers compte externe</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Montant</Label>
          <Input type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} placeholder="0.00" className="h-11" min="0" data-testid="withdraw-amount-input" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Devise</Label>
          <Select value={form.currency} onValueChange={v => setForm({...form, currency: v})}>
            <SelectTrigger className="h-11" data-testid="withdraw-currency-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              {wallets.map(w => <SelectItem key={w.currency} value={w.currency}>{w.currency} ({CURRENCY_SYMBOLS[w.currency]}{w.balance.toFixed(2)})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {wallet && <div className="text-xs text-muted-foreground">Solde: <span className="text-foreground font-medium">{CURRENCY_SYMBOLS[form.currency]}{wallet.balance.toLocaleString('fr-FR')}</span></div>}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Méthode</Label>
        <Select value={form.method} onValueChange={v => setForm({...form, method: v})}>
          <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="mobile_money">Mobile Money</SelectItem>
            <SelectItem value="bank_transfer">Virement Bancaire</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Destination ({form.method === 'mobile_money' ? 'Numéro' : 'IBAN'})</Label>
        <Input value={form.destination} onChange={e => setForm({...form, destination: e.target.value})} placeholder={form.method === 'mobile_money' ? '+243...' : 'FR76...'} className="h-11" data-testid="withdraw-destination-input" />
      </div>
      <Button className="w-full h-11 btn-primary-glow" onClick={handleWithdraw} disabled={loading} data-testid="withdraw-submit-btn">
        {loading ? <Loader2 size={16} className="animate-spin mr-2" /> : <Download size={16} className="mr-2" />}
        Retirer
      </Button>
    </div>
  );
}

export default function SendMoney() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [currencies, setCurrencies] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('send');

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ['send', 'recharge', 'withdraw'].includes(tab)) setActiveTab(tab);
  }, [searchParams]);

  useEffect(() => {
    const load = async () => {
      try {
        const [currRes, walRes] = await Promise.all([
          API.get('/currencies'),
          API.get('/wallet/balance')
        ]);
        setCurrencies(currRes.data.currencies || []);
        setWallets(walRes.data.wallets || []);
      } catch (e) { toast.error('Erreur de chargement'); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  if (loading) return (
    <div className="p-6 flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-primary" />
    </div>
  );

  return (
    <div className="p-4 lg:p-6 max-w-lg mx-auto">
      <div className="bg-card border border-border rounded-2xl p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full bg-secondary/50 mb-6">
            <TabsTrigger value="send" className="flex-1 text-xs gap-1" data-testid="tab-send"><Send size={14} />Envoyer</TabsTrigger>
            <TabsTrigger value="recharge" className="flex-1 text-xs gap-1" data-testid="tab-recharge"><Plus size={14} />Recharger</TabsTrigger>
            <TabsTrigger value="withdraw" className="flex-1 text-xs gap-1" data-testid="tab-withdraw"><Download size={14} />Retirer</TabsTrigger>
          </TabsList>
          <TabsContent value="send"><SendMoneyFlow currencies={currencies} wallets={wallets} user={user} /></TabsContent>
          <TabsContent value="recharge"><RechargeFlow currencies={currencies} user={user} /></TabsContent>
          <TabsContent value="withdraw"><WithdrawFlow currencies={currencies} wallets={wallets} /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
