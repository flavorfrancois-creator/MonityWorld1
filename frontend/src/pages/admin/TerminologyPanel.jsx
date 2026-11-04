import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import API from '../../utils/api';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Tag, Save } from 'lucide-react';
import { useTerminology } from '../../context/TerminologyContext';

export default function TerminologyPanel() {
  const { mode: current, refresh } = useTerminology();
  const [mode, setMode] = useState(current);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setMode(current); }, [current]);

  const save = async () => {
    setSaving(true);
    try {
      await API.put('/admin/settings/terminology', { mode });
      refresh();
      toast.success('Terminologie enregistrée');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    } finally { setSaving(false); }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 animate-fade-in-up">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <Tag size={18} className="text-primary" />
        </div>
        <h3 className="font-semibold text-foreground" style={{fontFamily:'Manrope'}}>Terminologie du compte</h3>
      </div>
      <div className="space-y-2 max-w-sm">
        <Label className="text-xs text-muted-foreground">Nom du numéro de compte</Label>
        <Select value={mode} onValueChange={setMode}>
          <SelectTrigger className="h-10" data-testid="terminology-select"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="standard">N° de compte</SelectItem>
            <SelectItem value="partner">N° partenaire</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground mt-4">
        Avec « N° partenaire » : Transfert devient « Switch access », Retrait devient « Accès physique » et Dépôt devient « Droit d'accès ».
      </p>
      <Button className="mt-4" onClick={save} disabled={saving} data-testid="save-terminology">
        <Save size={16} className="mr-2" /> {saving ? 'Enregistrement...' : 'Enregistrer'}
      </Button>
    </div>
  );
}
