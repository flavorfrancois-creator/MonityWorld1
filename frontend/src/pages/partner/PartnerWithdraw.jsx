import { useState } from 'react';
import API from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Phone, DollarSign, CheckCircle2, ArrowRight } from 'lucide-react';

export default function PartnerWithdraw() {
  const [clientPhone, setClientPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleWithdraw = async () => {
    if (!clientPhone || !amount || parseFloat(amount) <= 0) {
      toast.error('Veuillez remplir tous les champs');
      return;
    }
    
    setLoading(true);
    setResult(null);
    try {
      const res = await API.post('/partner/client/withdraw', {
        client_phone: clientPhone,
        amount: parseFloat(amount),
        currency
      });
      setResult(res.data);
      toast.success('Retrait effectué avec succès');
      
      // Update stored partner balance and emit event
      const partner = JSON.parse(localStorage.getItem('partner') || '{}');
      partner.balance = res.data.new_balance;
      localStorage.setItem('partner', JSON.stringify(partner));
      window.dispatchEvent(new CustomEvent('partnerUpdate'));
      
      // Reset form
      setClientPhone('');
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
          Retrait client
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Effectuez un retrait pour un client
        </p>
      </div>

      {/* Result Card */}
      {result && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 animate-fade-in-up">
          <div className="flex items-center gap-2 text-green-400 mb-3">
            <CheckCircle2 size={20} />
            <span className="font-medium">Retrait réussi</span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Client</span>
              <span className="text-foreground">{result.client_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Montant retiré</span>
              <span className="text-foreground">${result.amount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Frais client</span>
              <span className="text-muted-foreground">${result.client_fee}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-border">
              <span className="text-muted-foreground">Votre commission</span>
              <span className="text-green-400">+${result.commission_earned}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Nouveau solde</span>
              <span className="text-foreground font-medium">${result.new_balance?.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Form */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4 animate-fade-in-up stagger-1">
        <div>
          <label className="text-sm text-muted-foreground mb-2 block">Téléphone du client</label>
          <div className="relative">
            <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input 
              type="tel"
              value={clientPhone}
              onChange={e => setClientPhone(e.target.value)}
              placeholder="+243..."
              className="pl-10"
              data-testid="client-phone-withdraw"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Montant à retirer</label>
            <div className="relative">
              <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input 
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="100"
                className="pl-10"
                data-testid="withdraw-amount"
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
                <SelectItem value="CDF">CDF</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button 
          onClick={handleWithdraw} 
          disabled={loading}
          className="w-full btn-primary-glow"
          data-testid="withdraw-submit"
        >
          {loading ? 'Traitement...' : 'Effectuer le retrait'}
          <ArrowRight size={16} className="ml-2" />
        </Button>
      </div>
    </div>
  );
}
