import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import API from '../../utils/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { KeyRound, Save } from 'lucide-react';

export default function OtpSettingsPanel() {
  const [form, setForm] = useState({ registration_otp_minutes: 30, transaction_otp_minutes: 10 });
  const [ranges, setRanges] = useState({ registration: [30, 240], transaction: [5, 30] });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    API.get('/admin/otp/settings').then(res => {
      setForm({
        registration_otp_minutes: res.data.registration_otp_minutes,
        transaction_otp_minutes: res.data.transaction_otp_minutes,
      });
      setRanges({ registration: res.data.registration_range, transaction: res.data.transaction_range });
    }).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await API.put('/admin/otp/settings', {
        registration_otp_minutes: Number(form.registration_otp_minutes),
        transaction_otp_minutes: Number(form.transaction_otp_minutes),
      });
      toast.success('Durées OTP enregistrées');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    } finally { setSaving(false); }
  };

  const fields = [
    ['registration_otp_minutes', "Durée du code OTP d'inscription (minutes)", ranges.registration],
    ['transaction_otp_minutes', 'Durée du code OTP de transaction (minutes)', ranges.transaction],
  ];

  return (
    <div className="bg-card border border-border rounded-xl p-5 animate-fade-in-up">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <KeyRound size={18} className="text-primary" />
        </div>
        <h3 className="font-semibold text-foreground" style={{fontFamily:'Manrope'}}>Durée des codes OTP</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {fields.map(([key, label, [min, max]]) => (
          <div key={key} className="space-y-2">
            <Label className="text-xs text-muted-foreground">{label}</Label>
            <Input type="number" min={min} max={max} value={form[key]}
              onChange={e => setForm({ ...form, [key]: e.target.value })} className="h-10" data-testid={key} />
            <p className="text-xs text-muted-foreground">Entre {min} et {max} minutes</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-4">
        Un compte dont ni l'e-mail ni le téléphone n'est confirmé dans l'heure est supprimé automatiquement.
        Tant que le numéro de téléphone n'est pas confirmé, les transactions sont bloquées.
      </p>
      <Button className="mt-4" onClick={save} disabled={saving} data-testid="save-otp-settings">
        <Save size={16} className="mr-2" /> {saving ? 'Enregistrement...' : 'Enregistrer'}
      </Button>
    </div>
  );
}
