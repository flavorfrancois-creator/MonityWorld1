import React, { useState } from 'react';
import API from '../utils/api';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Input } from './ui/input';

export default function RestoreAccountLink() {
  const [open, setOpen] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const reset = () => { setOpen(false); setIdentifier(''); setCode(''); setSent(false); };

  const request = async () => {
    setBusy(true);
    try {
      const r = await API.post('/auth/account/restore/request', { identifier });
      toast.success(r.data.message);
      setSent(true);
    } catch (e) { toast.error(e?.response?.data?.detail || 'Erreur'); }
    finally { setBusy(false); }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const r = await API.post('/auth/account/restore/confirm', { identifier, code });
      toast.success(r.data.message);
      reset();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Erreur'); }
    finally { setBusy(false); }
  };

  if (!open) {
    return (
      <button type="button" className="text-xs text-muted-foreground underline mt-3" onClick={() => setOpen(true)} data-testid="restore-account-link">
        Restaurer mon compte
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-2 border rounded-lg p-3 text-left" data-testid="restore-account-form">
      <p className="text-xs text-muted-foreground">Compte supprimé depuis moins de 6 mois : entrez votre numéro (+243...) ou votre email.</p>
      <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="Numéro ou email" disabled={sent} />
      {sent && <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code reçu" inputMode="numeric" />}
      <div className="flex gap-2">
        {!sent
          ? <Button size="sm" type="button" disabled={busy || !identifier.trim()} onClick={request}>Envoyer le code</Button>
          : <Button size="sm" type="button" disabled={busy || code.length < 4} onClick={confirm}>Restaurer</Button>}
        <Button size="sm" type="button" variant="outline" onClick={reset}>Annuler</Button>
      </div>
    </div>
  );
}
