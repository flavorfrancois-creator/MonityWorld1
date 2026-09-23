import { useState, useEffect } from 'react';
import API from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Globe, Edit2, TrendingUp, RefreshCw } from 'lucide-react';

export default function AdminCurrencies() {
  const [currencies, setCurrencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [newRate, setNewRate] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchCurrencies = async () => {
    try {
      const res = await API.get('/admin/currencies');
      setCurrencies(res.data);
    } catch (e) { toast.error('Erreur de chargement'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchCurrencies(); }, []);

  const handleEdit = (cur) => {
    setEditing(cur);
    setNewRate(String(cur.rate_to_usd));
    setIsActive(cur.is_active);
  };

  const handleSave = async () => {
    if (!newRate || isNaN(parseFloat(newRate))) { toast.error('Taux invalide'); return; }
    setSaving(true);
    try {
      await API.patch(`/admin/currencies/${editing.code}`, { rate_to_usd: parseFloat(newRate), is_active: isActive });
      toast.success('Taux mis à jour !');
      setEditing(null);
      fetchCurrencies();
    } catch (e) { toast.error('Erreur'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="p-6 space-y-4">{[1,2,3].map(i => <div key={i} className="skeleton h-16 w-full rounded-xl" />)}</div>;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between animate-fade-in-up">
        <h2 className="text-xl font-bold text-foreground" style={{fontFamily:'Manrope'}}>Devises & Taux de change</h2>
        <Button variant="outline" size="sm" onClick={fetchCurrencies} data-testid="refresh-currencies-btn">
          <RefreshCw size={14} className="mr-1" />Actualiser
        </Button>
      </div>

      <div className="bg-secondary/20 border border-border rounded-xl p-4 text-sm text-muted-foreground animate-fade-in-up stagger-1">
        <p className="flex items-center gap-2"><TrendingUp size={14} className="text-primary" />Tous les taux sont exprimés en unités par 1 USD. Exemple: EUR = 0.92 signifie 1 USD = 0.92 EUR</p>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden animate-fade-in-up stagger-2">
        <div className="grid grid-cols-5 px-4 py-3 border-b border-border text-xs text-muted-foreground font-medium">
          <span>Symbole</span>
          <span className="col-span-2">Devise</span>
          <span>Taux (1 USD)</span>
          <span className="text-right">Actions</span>
        </div>
        {currencies.map(c => (
          <div key={c.code} className="grid grid-cols-5 items-center px-4 py-3.5 border-b border-border last:border-0 hover:bg-secondary/20 transition-colors" data-testid={`currency-row-${c.code}`}>
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-lg ${c.is_active ? 'bg-primary/10' : 'bg-secondary'} flex items-center justify-center`}>
                <span className="text-xs font-bold text-primary">{c.symbol}</span>
              </div>
              <span className="text-sm font-bold text-foreground">{c.code}</span>
            </div>
            <div className="col-span-2">
              <p className="text-sm text-foreground">{c.name}</p>
              <p className="text-xs text-muted-foreground">{c.is_active ? 'Active' : 'Inactive'}</p>
            </div>
            <div>
              <p className="text-sm font-mono font-semibold text-foreground">{c.rate_to_usd}</p>
              <p className="text-xs text-muted-foreground">Mis à jour: {c.last_updated ? new Date(c.last_updated).toLocaleDateString('fr-FR') : '—'}</p>
            </div>
            <div className="flex justify-end">
              <button onClick={() => handleEdit(c)} className="w-8 h-8 rounded-lg bg-secondary hover:bg-secondary/80 flex items-center justify-center transition-colors" data-testid={`edit-currency-${c.code}`}>
                <Edit2 size={14} className="text-foreground" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
          <DialogContent className="bg-card border-border sm:max-w-sm">
            <DialogHeader>
              <DialogTitle style={{fontFamily:'Manrope'}}>Modifier {editing.name} ({editing.code})</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="bg-secondary/30 rounded-lg p-3 text-sm">
                <p className="text-muted-foreground">Symbole: <span className="text-foreground font-bold">{editing.symbol}</span></p>
                <p className="text-muted-foreground mt-1">Taux actuel: <span className="text-foreground font-mono">{editing.rate_to_usd}</span></p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Nouveau taux (unités pour 1 USD)</Label>
                <Input type="number" step="0.0001" value={newRate} onChange={e => setNewRate(e.target.value)} placeholder="Ex: 600.0" className="h-11 font-mono" data-testid="new-rate-input" />
              </div>
              <div className="flex items-center gap-3 p-3 bg-secondary/30 rounded-lg">
                <input type="checkbox" id="isActive" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="w-4 h-4 rounded" data-testid="currency-active-toggle" />
                <label htmlFor="isActive" className="text-sm text-foreground cursor-pointer">Devise active</label>
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setEditing(null)}>Annuler</Button>
                <Button className="flex-1 btn-primary-glow" onClick={handleSave} disabled={saving} data-testid="save-currency-btn">
                  {saving ? 'Sauvegarde...' : 'Mettre à jour'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
