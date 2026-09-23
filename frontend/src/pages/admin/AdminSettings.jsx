import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Settings, Shield, Globe, DollarSign, Bell, Save } from 'lucide-react';

export default function AdminSettings() {
  const [fees, setFees] = useState({ transfer: '1.0', withdrawal: '1.5', recharge: '0' });
  const [limits, setLimits] = useState({ daily_transfer: '5000', monthly_transfer: '50000', auto_approve_limit: '200' });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setTimeout(() => {
      toast.success('Paramètres enregistrés (mode démo)');
      setSaving(false);
    }, 800);
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="animate-fade-in-up">
        <h2 className="text-xl font-bold text-foreground" style={{fontFamily:'Manrope'}}>Paramètres du système</h2>
        <p className="text-sm text-muted-foreground mt-1">Configuration globale de la plateforme</p>
      </div>

      {/* Fees */}
      <div className="bg-card border border-border rounded-xl p-5 animate-fade-in-up stagger-1">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <DollarSign size={18} className="text-primary" />
          </div>
          <h3 className="font-semibold text-foreground" style={{fontFamily:'Manrope'}}>Frais de transaction (%)</h3>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[['transfer', 'Transfert'], ['withdrawal', 'Retrait'], ['recharge', 'Rechargement']].map(([key, label]) => (
            <div key={key} className="space-y-2">
              <Label className="text-xs text-muted-foreground">{label}</Label>
              <div className="relative">
                <Input type="number" step="0.1" min="0" max="10" value={fees[key]} onChange={e => setFees({...fees, [key]: e.target.value})} className="h-10 pr-8" data-testid={`fee-${key}`} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Limits */}
      <div className="bg-card border border-border rounded-xl p-5 animate-fade-in-up stagger-2">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Shield size={18} className="text-blue-400" />
          </div>
          <h3 className="font-semibold text-foreground" style={{fontFamily:'Manrope'}}>Limites & Seuils</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            ['daily_transfer', 'Transfert max/jour (USD)'],
            ['monthly_transfer', 'Transfert max/mois (USD)'],
            ['auto_approve_limit', 'Seuil auto-validation (USD)'],
          ].map(([key, label]) => (
            <div key={key} className="space-y-2">
              <Label className="text-xs text-muted-foreground">{label}</Label>
              <Input type="number" value={limits[key]} onChange={e => setLimits({...limits, [key]: e.target.value})} className="h-10" data-testid={`limit-${key}`} />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">Les transactions inférieures au seuil d'auto-validation sont traitées immédiatement.</p>
      </div>

      {/* System Info */}
      <div className="bg-card border border-border rounded-xl p-5 animate-fade-in-up stagger-3">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center">
            <Settings size={18} className="text-green-400" />
          </div>
          <h3 className="font-semibold text-foreground" style={{fontFamily:'Manrope'}}>Informations système</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            ['Version', 'Monity World v1.0'],
            ['Backend', 'FastAPI + MongoDB'],
            ['Environnement', 'Production'],
            ['Dernière mise à jour', new Date().toLocaleDateString('fr-FR')],
            ['Comptes admin max', '3'],
            ['Langues supportées', '6 (FR, EN, ES, ZH, RU, LN)'],
          ].map(([k, v]) => (
            <div key={k} className="bg-secondary/30 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">{k}</p>
              <p className="text-sm font-medium text-foreground mt-0.5">{v}</p>
            </div>
          ))}
        </div>
      </div>

      <Button className="w-full sm:w-auto btn-primary-glow h-11 px-8" onClick={handleSave} disabled={saving} data-testid="save-settings-btn">
        <Save size={16} className="mr-2" />{saving ? 'Enregistrement...' : 'Enregistrer les paramètres'}
      </Button>
    </div>
  );
}
