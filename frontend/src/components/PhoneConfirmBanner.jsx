import { useState } from 'react';
import { toast } from 'sonner';
import API from '../utils/api';
import { Button } from './ui/button';
import { Input } from './ui/input';

export default function PhoneConfirmBanner({ user }) {
  const [sent, setSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (!user || user.phone_verified !== false || done) return null;

  const request = async () => {
    setBusy(true);
    try {
      await API.post('/auth/phone/request-otp');
      setSent(true);
      toast.success('Code envoyé via WhatsApp');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    } finally { setBusy(false); }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      await API.post('/auth/phone/confirm', { otp });
      setDone(true);
      toast.success('Numéro confirmé. Les transactions sont débloquées.');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Code incorrect');
    } finally { setBusy(false); }
  };

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 px-4 py-3 text-sm flex flex-wrap items-center gap-3" data-testid="phone-confirm-banner">
      <span className="flex-1 min-w-[200px]">Confirmez votre numéro de téléphone pour débloquer les transactions.</span>
      {sent && (
        <>
          <Input value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Code OTP" className="h-9 w-32" maxLength={6} />
          <Button size="sm" onClick={confirm} disabled={busy || otp.length !== 6}>Confirmer</Button>
        </>
      )}
      <Button size="sm" variant="outline" onClick={request} disabled={busy}>{sent ? 'Renvoyer' : 'Recevoir le code'}</Button>
    </div>
  );
}
