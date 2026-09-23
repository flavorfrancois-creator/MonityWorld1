import { useState } from 'react';
import API from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { CreditCard, DollarSign, CheckCircle2, ArrowRight, ArrowUpRight, ArrowDownRight } from 'lucide-react';

export default function PartnerNFC() {
  const [nfcSerial, setNfcSerial] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [mode, setMode] = useState('recharge');

  const handleNFCOperation = async () => {
    if ((!nfcSerial && !cardNumber) || !amount || parseFloat(amount) <= 0) {
      toast.error('Veuillez remplir tous les champs');
      return;
    }
    
    setLoading(true);
    setResult(null);
    try {
      const endpoint = mode === 'recharge' ? '/partner/nfc/recharge' : '/partner/nfc/withdraw';
      const res = await API.post(endpoint, {
        nfc_serial: nfcSerial || null,
        card_number: cardNumber || null,
        amount: parseFloat(amount),
        currency
      });
      setResult({ ...res.data, mode });
      toast.success(mode === 'recharge' ? 'Carte rechargée avec succès' : 'Retrait effectué avec succès');
      
      // Update stored partner balance and emit event
      const partner = JSON.parse(localStorage.getItem('partner') || '{}');
      partner.balance = res.data.partner_new_balance;
      localStorage.setItem('partner', JSON.stringify(partner));
      window.dispatchEvent(new CustomEvent('partnerUpdate'));
      
      // Reset form
      setNfcSerial('');
      setCardNumber('');
      setAmount('');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-lg mx-auto space-y-6">
      <div className="animate-fade-in-up">
        <h1 className="text-xl font-bold text-foreground" style={{fontFamily:'Manrope'}}>
          Cartes NFC Standalone
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Recharger ou retirer des fonds des cartes NFC non liées à un compte
        </p>
      </div>

      {/* Result Card */}
      {result && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 animate-fade-in-up">
          <div className="flex items-center gap-2 text-green-400 mb-3">
            <CheckCircle2 size={20} />
            <span className="font-medium">
              {result.mode === 'recharge' ? 'Recharge réussie' : 'Retrait réussi'}
            </span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Carte</span>
              <span className="text-foreground">{result.card_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Montant</span>
              <span className="text-foreground">${result.amount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Solde carte</span>
              <span className="text-blue-400">${result.card_new_balance?.toFixed(2)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-border">
              <span className="text-muted-foreground">Votre commission</span>
              <span className="text-green-400">+${result.commission_earned}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Votre nouveau solde</span>
              <span className="text-foreground font-medium">${result.partner_new_balance?.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={mode} onValueChange={setMode} className="animate-fade-in-up stagger-1">
        <TabsList className="grid w-full grid-cols-2 bg-secondary/30">
          <TabsTrigger value="recharge" className="flex items-center gap-2">
            <ArrowUpRight size={14} /> Recharger
          </TabsTrigger>
          <TabsTrigger value="withdraw" className="flex items-center gap-2">
            <ArrowDownRight size={14} /> Retirer
          </TabsTrigger>
        </TabsList>

        <TabsContent value="recharge" className="mt-4">
          <NFCForm 
            nfcSerial={nfcSerial}
            setNfcSerial={setNfcSerial}
            cardNumber={cardNumber}
            setCardNumber={setCardNumber}
            amount={amount}
            setAmount={setAmount}
            currency={currency}
            setCurrency={setCurrency}
            loading={loading}
            onSubmit={handleNFCOperation}
            buttonText="Recharger la carte"
          />
        </TabsContent>

        <TabsContent value="withdraw" className="mt-4">
          <NFCForm 
            nfcSerial={nfcSerial}
            setNfcSerial={setNfcSerial}
            cardNumber={cardNumber}
            setCardNumber={setCardNumber}
            amount={amount}
            setAmount={setAmount}
            currency={currency}
            setCurrency={setCurrency}
            loading={loading}
            onSubmit={handleNFCOperation}
            buttonText="Effectuer le retrait"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function NFCForm({ nfcSerial, setNfcSerial, cardNumber, setCardNumber, amount, setAmount, currency, setCurrency, loading, onSubmit, buttonText }) {
  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
      <div>
        <label className="text-sm text-muted-foreground mb-2 block">Numéro NFC (ex: 05:G8:5F:54:22:75:Y5)</label>
        <div className="relative">
          <CreditCard size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input 
            value={nfcSerial}
            onChange={e => setNfcSerial(e.target.value)}
            placeholder="XX:XX:XX:XX:XX:XX:XX"
            className="pl-10 font-mono"
            data-testid="nfc-serial"
          />
        </div>
      </div>

      <div className="text-center text-muted-foreground text-sm">ou</div>

      <div>
        <label className="text-sm text-muted-foreground mb-2 block">Numéro de carte (16 chiffres)</label>
        <div className="relative">
          <CreditCard size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input 
            value={cardNumber}
            onChange={e => setCardNumber(e.target.value)}
            placeholder="8552-9657-5431-4523"
            className="pl-10 font-mono"
            data-testid="card-number"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm text-muted-foreground mb-2 block">Montant</label>
          <div className="relative">
            <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input 
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="100"
              className="pl-10"
              data-testid="nfc-amount"
            />
          </div>
        </div>
        <div>
          <label className="text-sm text-muted-foreground mb-2 block">Devise</label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="EUR">EUR</SelectItem>
              <SelectItem value="XAF">XAF</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button 
        onClick={onSubmit} 
        disabled={loading}
        className="w-full btn-primary-glow"
        data-testid="nfc-submit"
      >
        {loading ? 'Traitement...' : buttonText}
        <ArrowRight size={16} className="ml-2" />
      </Button>
    </div>
  );
}
