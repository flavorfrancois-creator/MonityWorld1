import { useState, useEffect } from 'react';
import API from '../utils/api';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { PiggyBank, Plus, TrendingUp, Lock, CheckCircle2, Loader2, ArrowUpRight } from 'lucide-react';

const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', XAF: 'FCFA', XOF: 'FCFA', GBP: '£', CNY: '¥', CDF: 'FC' };

export default function SavingsPage() {
  const [savings, setSavings] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ type: 'flexible', amount: '', currency: 'USD', duration_months: '' });

  const fetchData = async () => {
    try {
      const [sRes, wRes, cRes] = await Promise.all([API.get('/savings'), API.get('/wallet/wallets'), API.get('/currencies')]);
      setSavings(sRes.data);
      setWallets(wRes.data);
      setCurrencies(cRes.data);
    } catch (e) { toast.error('Erreur de chargement'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error('Montant invalide'); return; }
    if (form.type === 'fixed' && !form.duration_months) { toast.error('Durée requise pour l\'épargne fixe'); return; }
    setCreating(true);
    try {
      const payload = { type: form.type, amount: parseFloat(form.amount), currency: form.currency };
      if (form.type === 'fixed' && form.duration_months) payload.duration_months = parseInt(form.duration_months);
      await API.post('/savings', payload);
      toast.success('Épargne créée avec succès !');
      setCreateOpen(false);
      setForm({ type: 'flexible', amount: '', currency: 'USD', duration_months: '' });
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || 'Erreur'); }
    finally { setCreating(false); }
  };

  const handleWithdraw = async (savingId) => {
    if (!window.confirm('Retirer cette épargne ?')) return;
    try {
      const res = await API.delete(`/savings/${savingId}`);
      toast.success(`Retrait réussi ! Total: ${res.data.total} (intérêts: ${res.data.interest})`);
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || 'Erreur'); }
  };

  const activeSavings = savings.filter(s => s.status === 'active');
  const completedSavings = savings.filter(s => s.status === 'completed');
  const totalActive = activeSavings.reduce((sum, s) => sum + s.amount, 0);
  const wallet = wallets.find(w => w.currency === form.currency);

  if (loading) return <div className="p-6 space-y-4">{[1,2,3].map(i => <div key={i} className="skeleton h-24 w-full rounded-xl" />)}</div>;

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between animate-fade-in-up">
        <h2 className="text-xl font-bold text-foreground" style={{fontFamily:'Manrope'}}>Épargne</h2>
        <Button size="sm" className="btn-primary-glow" onClick={() => setCreateOpen(true)} data-testid="create-savings-btn">
          <Plus size={14} className="mr-1" /> Épargner
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 animate-fade-in-up stagger-1">
        <div className="bg-card border border-border rounded-xl p-4">
          <PiggyBank size={16} className="text-primary mb-2" />
          <p className="text-lg font-bold text-foreground" style={{fontFamily:'Manrope'}}>{activeSavings.length}</p>
          <p className="text-xs text-muted-foreground">Épargnes actives</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <TrendingUp size={16} className="text-green-400 mb-2" />
          <p className="text-lg font-bold text-foreground" style={{fontFamily:'Manrope'}}>${totalActive.toFixed(0)}</p>
          <p className="text-xs text-muted-foreground">Total épargné</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <CheckCircle2 size={16} className="text-blue-400 mb-2" />
          <p className="text-lg font-bold text-foreground" style={{fontFamily:'Manrope'}}>{completedSavings.length}</p>
          <p className="text-xs text-muted-foreground">Terminées</p>
        </div>
      </div>

      {/* Active Savings */}
      {activeSavings.length > 0 && (
        <div className="animate-fade-in-up stagger-2">
          <h3 className="font-semibold text-foreground mb-3">Épargnes actives</h3>
          <div className="space-y-3">
            {activeSavings.map(s => {
              const isLocked = s.locked_until && new Date(s.locked_until) > new Date();
              return (
                <div key={s.id} className="bg-card border border-border rounded-xl p-4" data-testid={`savings-${s.id}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-foreground">{s.type === 'fixed' ? 'Épargne Fixe' : 'Épargne Flexible'}</span>
                        {isLocked ? <span className="badge-pending text-xs px-2 py-0.5 rounded-full flex items-center gap-1"><Lock size={10} />Verrouillée</span> : <span className="badge-completed text-xs px-2 py-0.5 rounded-full">Disponible</span>}
                      </div>
                      <p className="text-2xl font-bold text-foreground" style={{fontFamily:'Manrope'}}>{CURRENCY_SYMBOLS[s.currency]}{s.amount.toLocaleString('fr-FR')}</p>
                      <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                        <span>Taux: {(s.interest_rate * 100).toFixed(0)}% /an</span>
                        <span>Depuis: {new Date(s.created_at).toLocaleDateString('fr-FR')}</span>
                        {s.locked_until && <span>Déblocage: {new Date(s.locked_until).toLocaleDateString('fr-FR')}</span>}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => handleWithdraw(s.id)} disabled={isLocked} className="flex-shrink-0" data-testid={`withdraw-savings-${s.id}`}>
                      <ArrowUpRight size={14} className="mr-1" />Retirer
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeSavings.length === 0 && (
        <div className="bg-card border border-dashed border-border rounded-xl p-12 text-center animate-fade-in-up">
          <PiggyBank size={40} className="text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-foreground font-medium mb-1">Commencez à épargner</p>
          <p className="text-muted-foreground text-sm mb-4">Constituez votre épargne et gagnez jusqu'à 8% d'intérêts</p>
          <Button className="btn-primary-glow" onClick={() => setCreateOpen(true)}>Créer une épargne</Button>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-card border-border sm:max-w-sm">
          <DialogHeader><DialogTitle style={{fontFamily:'Manrope'}}>Créer une épargne</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Type d'épargne</Label>
              <div className="grid grid-cols-2 gap-2">
                {['flexible', 'fixed'].map(t => (
                  <button key={t} onClick={() => setForm({...form, type: t})}
                    className={`p-3 rounded-lg border text-sm font-medium transition-colors ${form.type === t ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
                    data-testid={`savings-type-${t}`}>
                    {t === 'flexible' ? 'Flexible (5%/an)' : 'Fixe (8%/an)'}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Montant</Label>
                <Input type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} placeholder="0.00" className="h-11" data-testid="savings-amount-input" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Devise</Label>
                <Select value={form.currency} onValueChange={v => setForm({...form, currency: v})}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>{wallets.map(w => <SelectItem key={w.currency} value={w.currency}>{w.currency} (Solde: {w.balance})</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {form.type === 'fixed' && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Durée (mois)</Label>
                <Select value={form.duration_months} onValueChange={v => setForm({...form, duration_months: v})}>
                  <SelectTrigger className="h-11" data-testid="savings-duration-select"><SelectValue placeholder="Choisir durée" /></SelectTrigger>
                  <SelectContent>
                    {[3,6,12,24,36].map(m => <SelectItem key={m} value={String(m)}>{m} mois</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {wallet && <p className="text-xs text-muted-foreground">Disponible: <span className="text-foreground">{wallet.balance} {form.currency}</span></p>}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setCreateOpen(false)}>Annuler</Button>
              <Button className="flex-1 btn-primary-glow" onClick={handleCreate} disabled={creating} data-testid="savings-create-submit-btn">
                {creating ? <Loader2 size={14} className="animate-spin mr-2" /> : null}Épargner
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
